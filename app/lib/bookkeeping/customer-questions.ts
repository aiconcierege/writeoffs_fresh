import type { SupabaseClient } from '@supabase/supabase-js'
import type { CanonicalWeeklyReviewItem } from './model'
import { listCanonicalReviewQueue } from './review-queue'
import { currentPlaidFinancialState, plaidFinancialTransactionIsCurrent } from '../plaid/current-sources'
import { loadCurrentRecordConvergences } from './current-record-resolution'

export type CustomerQuestion = {
  id: string
  version: string
  source?: 'bookkeeping' | 'deduction'
  kind: 'business_use' | 'business_purpose' | 'mixed_use' | 'factual_choice'
    | 'percentage' | 'yes_no' | 'integer' | 'date'
  prompt: string
  guidance?: string
  options?: Array<{ id: string; label: string }>
  transaction: {
    merchant: string
    amountCents: number | null
    currency: string
    date: string | null
  }
}

type TransactionContext = CustomerQuestion['transaction']

const INTERNAL_WORDS = /bookkeep|classification|confidence|evidence conflict|schedule c|tax categor|approv|allocation|treatment/i

export function customerQuestionHeadline(count: number) {
  return `${count} quick ${count === 1 ? 'question' : 'questions'} for you`
}

export function parsePositiveDollarCents(value: string) {
  const trimmed = value.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null
  const [dollars, cents = ''] = trimmed.split('.')
  const result = Number(dollars) * 100 + Number(cents.padEnd(2, '0'))
  return Number.isSafeInteger(result) && result > 0 ? result : null
}

export function projectCustomerQuestion(
  item: CanonicalWeeklyReviewItem,
  transaction: TransactionContext
): CustomerQuestion | null {
  const base = {
    id: item.event.reviewIssueId,
    version: item.event.id,
    transaction,
  }
  const isPurchase = item.decision.bookkeepingNature === 'expense'
  if (item.event.reason === 'BUSINESS_USE_UNCLEAR') {
    return isPurchase
      ? { ...base, kind: 'business_use', prompt: 'Was this purchase for your business?' }
      : null
  }
  if (item.event.reason === 'BUSINESS_PURPOSE_NEEDED') {
    return isPurchase ? {
      ...base,
      kind: 'business_purpose',
      prompt: 'What was this purchase for?',
      guidance: 'Tell WriteOffs what you bought or why you needed it.',
    } : null
  }
  if (item.event.reason === 'MIXED_USE_CLARIFICATION') {
    return isPurchase
      ? { ...base, kind: 'mixed_use', prompt: 'Was any of this purchase personal?' }
      : null
  }
  if (item.event.reason === 'CONFLICTING_EVIDENCE') {
    const raw = item.event.questionContext?.options
    if (!Array.isArray(raw)) return null
    const options = raw.flatMap((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return []
      const option = value as Record<string, unknown>
      if (
        typeof option.optionId !== 'string' ||
        typeof option.factualMeaning !== 'string' ||
        option.optionId === 'none_of_these' ||
        !option.optionId.trim() || !option.factualMeaning.trim() ||
        INTERNAL_WORDS.test(option.factualMeaning)
      ) return []
      return [{ id: option.optionId, label: option.factualMeaning }]
    })
    if (options.length < 2) return null
    return {
      ...base,
      kind: 'factual_choice',
      prompt: 'What actually happened with this transaction?',
      options,
    }
  }
  return null
}

export async function listCustomerQuestions(input: { supabase: SupabaseClient }) {
  const deductionQuestions = await listDeductionQuestions(input.supabase)
  const queue = await listCanonicalReviewQueue(input)
  const recordIds = [...new Set(queue.map(({ record }) => record.id))]
  if (!recordIds.length) return deductionQuestions
  const businessId = queue[0].record.businessId
  const resolution = await loadCurrentRecordConvergences({
    supabase: input.supabase, businessId,
  })

  const [{ data: records, error: recordError }, { data: sources, error: sourceError }] =
    await Promise.all([
      input.supabase.from('bookkeeping_records')
        .select('id,amount_cents,currency,occurred_on').in('id', recordIds),
      input.supabase.from('bookkeeping_financial_sources')
        .select('bookkeeping_record_id,financial_transaction_id')
        .in('bookkeeping_record_id', recordIds).is('revoked_at', null),
    ])
  if (recordError) throw new Error(`Unable to load question records: ${recordError.message}`)
  if (sourceError) throw new Error(`Unable to load question sources: ${sourceError.message}`)

  const currentSources = [
    ...(sources ?? []),
    ...resolution.compoundComponents.filter((component) => recordIds.includes(component.recordId))
      .map((component) => ({
        bookkeeping_record_id: component.recordId,
        financial_transaction_id: component.financialTransactionId,
      })),
  ]

  const transactionIds = currentSources.map((source) => source.financial_transaction_id)
  const { data: transactions, error: transactionError } = transactionIds.length
    ? await input.supabase.from('financial_transactions')
      .select('id,merchant_name,original_description,amount_cents,currency,transaction_date')
      .in('id', transactionIds)
    : { data: [], error: null }
  if (transactionError) {
    throw new Error(`Unable to load question transactions: ${transactionError.message}`)
  }

  const recordById = new Map((records ?? []).map((record) => [record.id, record]))
  const sourceByRecord = new Map(currentSources.map((source) => [
    source.bookkeeping_record_id, source.financial_transaction_id,
  ]))
  const transactionById = new Map((transactions ?? []).map((transaction) => [
    transaction.id, transaction,
  ]))

  const plaidState = await currentPlaidFinancialState({
    supabase: input.supabase, businessId, candidateFinancialTransactionIds: transactionIds,
  })

  const bookkeepingQuestions = queue.flatMap((item) => {
    const record = recordById.get(item.record.id)
    const transactionId = sourceByRecord.get(item.record.id)
    const transaction = transactionId ? transactionById.get(transactionId) : null
    if (transactionId && !plaidFinancialTransactionIsCurrent({ id: transactionId, state: plaidState })) return []
    const context: TransactionContext = {
      merchant: transaction?.merchant_name || transaction?.original_description || 'Transaction',
      amountCents: transaction?.amount_cents ?? record?.amount_cents ??
        item.record.authoritativeAmountCents,
      currency: transaction?.currency ?? record?.currency ??
        item.record.authoritativeCurrency,
      date: transaction?.transaction_date ?? record?.occurred_on ?? null,
    }
    const question = projectCustomerQuestion(item, context)
    return question ? [{ ...question, source: 'bookkeeping' as const }] : []
  })
  return [...bookkeepingQuestions, ...deductionQuestions]
}

async function listDeductionQuestions(supabase: SupabaseClient): Promise<CustomerQuestion[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('An authenticated user is required.')
  const { data: business, error: businessError } = await supabase.from('businesses').select('id')
    .eq('owner_user_id', user.id).maybeSingle()
  if (businessError || !business) throw new Error('Business was not found for the authenticated user.')
  const { data: attentions, error } = await supabase.from('current_deduction_attentions')
    .select('id,attention_id,event_type,fact_type,bookkeeping_record_id,question_type,prompt,guidance,scope_key')
    .eq('business_id', business.id).eq('event_type', 'opened').order('created_at')
  if (error) throw new Error(`Unable to load deduction questions: ${error.message}`)
  const recordIds = (attentions ?? []).map((row) => row.bookkeeping_record_id).filter(Boolean)
  const { data: records, error: recordsError } = recordIds.length
    ? await supabase.from('bookkeeping_records').select('id,amount_cents,currency,occurred_on')
      .eq('business_id', business.id).in('id', recordIds)
    : { data: [], error: null }
  if (recordsError) throw new Error(`Unable to load deduction question context: ${recordsError.message}`)
  const recordById = new Map((records ?? []).map((row) => [row.id, row]))
  return (attentions ?? []).map((attention) => {
    const record = attention.bookkeeping_record_id ? recordById.get(attention.bookkeeping_record_id) : null
    return {
      id: attention.attention_id, version: attention.id, source: 'deduction' as const,
      kind: attention.question_type as CustomerQuestion['kind'], prompt: attention.prompt,
      guidance: attention.guidance ?? undefined,
      transaction: { merchant: attention.bookkeeping_record_id ? attention.scope_key : 'Your business',
        amountCents: record?.amount_cents == null ? null : Number(record.amount_cents),
        currency: record?.currency ?? 'USD', date: record?.occurred_on ?? null },
    }
  })
}
