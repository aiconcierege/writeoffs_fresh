import type { SupabaseClient } from '@supabase/supabase-js'
import type { CanonicalWeeklyReviewItem } from './model'
import { listCanonicalReviewQueue } from './review-queue'
import { currentPlaidFinancialState, plaidFinancialTransactionIsCurrent } from '../plaid/current-sources'
import { loadCurrentRecordConvergences } from './current-record-resolution'

export type CustomerQuestion = {
  id: string
  version: string
  source?: 'bookkeeping' | 'deduction' | 'contractor'
  kind: 'business_use' | 'business_purpose' | 'meal_relationship' | 'mixed_use' | 'transaction_type' | 'factual_choice'
    | 'percentage' | 'yes_no' | 'integer' | 'date'
  materiality?:'totals'|'disclosable'
  recordId?:string
  prompt: string
  guidance?: string
  options?: Array<{ id: string; label: string }>
  transaction: {
    merchant: string
    amountCents: number | null
    currency: string
    date: string | null
  }
  evidence?: { receiptUrl: string; label: string }
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
  const context = item.event.questionContext
  const trustedContext = context?.schemaVersion === 1 && context.reason === item.event.reason
  if (!trustedContext) return null
  if (item.event.reason === 'BUSINESS_USE_UNCLEAR') {
    return isPurchase
      ? { ...base, kind: 'business_use', prompt: 'Was this purchase for your business?' }
      : null
  }
  if (item.event.reason === 'BUSINESS_PURPOSE_NEEDED') {
    const hasBusinessPortion = item.decision.allocations.some((allocation) =>
      allocation.kind === 'business' && allocation.amountCents !== 0)
    if (context?.factType === 'meal_attendee_relationship') return isPurchase
      && ['business', 'mixed_use'].includes(item.decision.treatment) && hasBusinessPortion ? {
        ...base,
        kind: 'meal_relationship',
        prompt: 'Who was the meal with?',
        guidance: 'List the person or people and their business relationship. For example: Sarah Jones, client.',
      } : null
    return isPurchase && ['business', 'mixed_use'].includes(item.decision.treatment)
      && hasBusinessPortion ? {
      ...base,
      kind: 'business_purpose',
      prompt: 'What was this purchase for?',
      guidance: 'Tell WriteOffs what you bought or why you needed it.',
    } : null
  }
  if (item.event.reason === 'MIXED_USE_CLARIFICATION') {
    return isPurchase && context?.businessUse === 'mixed'
      ? { ...base, kind: 'mixed_use', prompt: 'Was any of this purchase personal?' }
      : null
  }
  if(item.event.reason==='TRANSACTION_TYPE_UNCLEAR')return{
    ...base,kind:'transaction_type',materiality:'totals',prompt:'What kind of activity was this?',
    guidance:'Choose what happened. I’ll handle the bookkeeping rules.',options:[
      ['purchase','A purchase'],['earned_money','Money I earned'],['moved_money','Money moved between accounts'],
      ['paid_card','A credit card payment'],['received_refund','A refund'],['added_own_money','Money I added'],
      ['borrowed_money','Money I borrowed'],
    ].map(([id,label])=>({id,label}))}
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

export async function listCustomerQuestions(input: { supabase: SupabaseClient; scope?:'expenses'|'business' }) {
  const ensured = await input.supabase.rpc('ensure_current_meal_substantiation_questions')
  if (ensured.error && ensured.error.code !== 'PGRST202') throw new Error('Meal substantiation questions could not be prepared.')
  const receiptMeals = await input.supabase.rpc('ensure_current_receipt_meal_candidate_questions')
  if (receiptMeals.error && receiptMeals.error.code !== 'PGRST202') throw new Error('Receipt meal questions could not be prepared.')
  const deductionQuestions = await listDeductionQuestions(input.supabase)
  const contractorQuestions = await listContractorQuestions(input.supabase)
  const queue = await listCanonicalReviewQueue(input)
  const recordIds = [...new Set(queue.map(({ record }) => record.id))]
  if (!recordIds.length) return [...deductionQuestions, ...contractorQuestions]
  const businessId = queue[0].record.businessId
  const resolution = await loadCurrentRecordConvergences({
    supabase: input.supabase, businessId,
  })

  const [{ data: records, error: recordError }, { data: sources, error: sourceError }, documentResult] =
    await Promise.all([
      input.supabase.from('bookkeeping_records')
        .select('id,amount_cents,currency,occurred_on').in('id', recordIds),
      input.supabase.from('bookkeeping_financial_sources')
        .select('bookkeeping_record_id,financial_transaction_id')
        .in('bookkeeping_record_id', recordIds).is('revoked_at', null),
      input.supabase.from('bookkeeping_document_links').select('bookkeeping_record_id,receipt_id')
        .eq('business_id', businessId).in('bookkeeping_record_id', recordIds).is('revoked_at', null),
    ])
  if (recordError) throw new Error(`Unable to load question records: ${recordError.message}`)
  if (sourceError) throw new Error(`Unable to load question sources: ${sourceError.message}`)
  if (documentResult.error) throw new Error(`Unable to load question evidence: ${documentResult.error.message}`)

  const receiptIds=[...new Set((documentResult.data??[]).map((row)=>row.receipt_id))]
  const receiptResult=receiptIds.length?await input.supabase.from('receipts').select('id,storage_path,original_name')
    .in('id',receiptIds):{data:[],error:null}
  if(receiptResult.error)throw new Error(`Unable to load question evidence: ${receiptResult.error.message}`)
  const receiptById=new Map((receiptResult.data??[]).map((row)=>[row.id,row]))
  const evidenceByRecord=new Map<string,{receiptUrl:string;label:string}>()
  for(const link of documentResult.data??[]){const receipt=receiptById.get(link.receipt_id);if(!receipt)continue
    evidenceByRecord.set(link.bookkeeping_record_id,{receiptUrl:`/api/receipts/${receipt.id}/view`,label:receipt.original_name??'Receipt'})}

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
    return question ? [{ ...question, source: 'bookkeeping' as const,recordId:item.record.id,
      materiality:(['BUSINESS_USE_UNCLEAR','MIXED_USE_CLARIFICATION','TRANSACTION_TYPE_UNCLEAR','CONFLICTING_EVIDENCE'].includes(item.event.reason)?'totals':'disclosable') as CustomerQuestion['materiality'],
      evidence:evidenceByRecord.get(item.record.id) }] : []
  })
  const precedence:Record<CustomerQuestion['kind'],number>={mixed_use:1,transaction_type:2,business_use:3,business_purpose:4,meal_relationship:5,factual_choice:6,percentage:7,yes_no:7,integer:7,date:7}
  bookkeepingQuestions.sort((a,b)=>(precedence[a.kind]??99)-(precedence[b.kind]??99))
  const chosenRecords=new Set<string>()
  const deduplicated=bookkeepingQuestions.filter(question=>{if(!question.recordId)return true
    if(chosenRecords.has(question.recordId))return false;chosenRecords.add(question.recordId);return true})
  const scopedBookkeeping=input.scope==='expenses'?deduplicated.filter(question=>(question.transaction.amountCents??0)<=0):deduplicated
  return [...scopedBookkeeping, ...deductionQuestions, ...contractorQuestions]
}

async function listContractorQuestions(supabase: SupabaseClient): Promise<CustomerQuestion[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('An authenticated user is required.')
  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  if (!business) return []
  const [{ data: payments, error: paymentError }, { data: contractors, error: contractorError },
    { data: w9, error: w9Error }] = await Promise.all([
    supabase.from('current_contractor_payments').select('*').eq('business_id', business.id),
    supabase.from('current_canonical_contractors').select('id,display_name').eq('business_id', business.id),
    supabase.from('current_contractor_w9_status').select('*').eq('business_id', business.id),
  ])
  if (paymentError || contractorError || w9Error) throw new Error('Unable to load contractor questions.')
  const contractorById = new Map((contractors ?? []).map(row => [row.id, row]))
  const questions: CustomerQuestion[] = []
  for (const payment of payments ?? []) if (payment.payment_method === 'unknown') {
    const contractor = contractorById.get(payment.contractor_id)
    questions.push({ id: payment.id, version: payment.id, source: 'contractor', kind: 'factual_choice',
      prompt: `How did you pay ${contractor?.display_name ?? 'this contractor'}?`,
      guidance: 'Choose the factual payment method. WriteOffs will evaluate reporting implications separately.',
      options: [['cash','Cash'],['check','Check'],['ach_zelle','ACH / Zelle'],['payment_card','Payment card'],
        ['third_party_service','Third-party payment service'],['other','Other']].map(([id,label]) => ({ id, label })),
      transaction: { merchant: contractor?.display_name ?? 'Contractor payment', amountCents: Number(payment.amount_cents),
        currency: 'USD', date: payment.paid_on } })
  }
  const contractorsWithPayments = new Set((payments ?? []).map(row => row.contractor_id))
  for (const status of w9 ?? []) if (contractorsWithPayments.has(status.contractor_id) && status.status !== 'on_file') {
    const contractor = contractorById.get(status.contractor_id)
    questions.push({ id: status.id, version: status.id, source: 'contractor', kind: 'factual_choice',
      prompt: `Do you have a W-9 from ${contractor?.display_name ?? 'this contractor'}?`,
      guidance: 'Do not enter a Social Security number or EIN.',
      options: [{ id: 'on_file', label: 'Yes, it is on file' }, { id: 'needed', label: 'No, I need it' },
        { id: 'needs_attention', label: 'I need to check' }],
      transaction: { merchant: contractor?.display_name ?? 'Contractor', amountCents: null, currency: 'USD', date: null } })
  }
  return questions
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
