import type { SupabaseClient } from '@supabase/supabase-js'
import type { CanonicalWeeklyReviewItem } from './model'
import { listCanonicalReviewQueue } from './review-queue'
import { currentPlaidFinancialState, plaidFinancialTransactionIsCurrent } from '../plaid/current-sources'
import { loadCurrentRecordConvergences } from './current-record-resolution'
import { economicContextSignal, type EconomicContextSignal } from './evidence-aware-routing'

export type CustomerQuestion = {
  id: string
  version: string
  source?: 'bookkeeping' | 'deduction' | 'contractor'
  kind: 'business_use' | 'business_purpose' | 'meal_relationship' | 'mixed_use' | 'transaction_type' | 'factual_choice'
    | 'percentage' | 'yes_no' | 'integer' | 'date'
  nonConversational?: boolean
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
  openedAt?: string
  availableAt?: string | null
  contextFingerprint?: string
}

export type CurrentAskableQuestionQueue = {
  asOf: string
  count: number
  oldestOutstandingAt: string | null
  questions: CustomerQuestion[]
}

const QUESTION_PRECEDENCE:Record<CustomerQuestion['kind'],number>={percentage:1,meal_relationship:2,
  business_use:3,mixed_use:4,business_purpose:5,factual_choice:6,transaction_type:7,yes_no:8,integer:8,date:8}

export function selectCurrentAskableQuestions(input:{
  bookkeeping:CustomerQuestion[]
  deduction:CustomerQuestion[]
  contractor:CustomerQuestion[]
  scope:'expenses'|'business'
  asOf:string
}){
  const available=(question:CustomerQuestion)=>!question.availableAt||question.availableAt<=input.asOf
  const bookkeeping=input.bookkeeping.filter(available)
    .sort((a,b)=>(QUESTION_PRECEDENCE[a.kind]??99)-(QUESTION_PRECEDENCE[b.kind]??99))
  const chosenRecords=new Set<string>()
  const deduplicated=bookkeeping.filter(question=>{if(!question.recordId)return true
    if(chosenRecords.has(question.recordId))return false;chosenRecords.add(question.recordId);return true})
  const scoped=input.scope==='expenses'
    ?deduplicated.filter(question=>(question.transaction.amountCents??0)<=0):deduplicated
  const specializedRecordIds=new Set(input.deduction.filter(question=>available(question)
    &&question.recordId&&question.kind==='percentage').map(question=>question.recordId))
  return [...scoped.filter(question=>!question.recordId||!specializedRecordIds.has(question.recordId)),
    ...input.deduction.filter(available),...input.contractor.filter(available)]
    .sort((a,b) => (a.transaction.date ?? a.openedAt ?? input.asOf).localeCompare(b.transaction.date ?? b.openedAt ?? input.asOf)
      || (a.openedAt ?? '').localeCompare(b.openedAt ?? '') || a.id.localeCompare(b.id))
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
  transaction: TransactionContext,
  economicContext?: EconomicContextSignal | null,
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
    if (context?.factType === 'receipt_meal_candidate') return isPurchase
      ? { ...base, kind: 'business_use', prompt: 'Was this meal for business?' }
      : null
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
    if (context?.factType === 'receipt_meal_business_purpose'
      || context?.factType === 'receipt_meal_candidate') return isPurchase
      && ['business', 'mixed_use'].includes(item.decision.treatment) && hasBusinessPortion ? {
        ...base,
        kind: 'business_purpose',
        prompt: 'What was the business reason for the meal?',
        guidance: 'For example: Discussed a customer project or met with a prospective client.',
      } : null
    if (context?.factType === 'business_travel_details') return isPurchase
      && ['business', 'mixed_use'].includes(item.decision.treatment) ? {
        ...base, kind: 'business_purpose',
        prompt: 'Where did you travel, when, and what was the business reason?',
        guidance: 'Tell me the destination, trip dates, and what the trip was for.',
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
    // Opening this canonical issue already validates the financial source,
    // current decision leaf, period, tenant, and negative transaction shape.
    // Nature may intentionally remain unresolved until after the customer gives
    // the mixed allocation, so it must not suppress the authoritative question.
    return context?.businessUse === 'mixed'
      ? { ...base, kind: 'mixed_use', prompt: 'Was any of this purchase personal?' }
      : null
  }
  if (item.event.reason === 'TRANSACTION_TYPE_UNCLEAR' && (transaction.amountCents ?? 0) > 0) return {
    ...base, kind: 'transaction_type', materiality: 'totals', prompt: 'What was this money for?',
    guidance: 'Tell me where it came from. I’ll handle the bookkeeping.',
    options: [
      ['earned_money', 'Payment from a customer'], ['moved_money', 'Transfer between my accounts'],
      ['added_own_money', 'Money I added to the business'], ['borrowed_money', 'Loan proceeds'],
      ['received_refund', 'Refund or reimbursement'], ['other', 'Something else'],
    ].map(([id, label]) => ({ id, label })),
  }
  if(item.event.reason==='TRANSACTION_TYPE_UNCLEAR')return{
    ...base,kind:'transaction_type',materiality:'totals',prompt:'What kind of activity was this?',
    guidance:'Choose what happened. I’ll handle the bookkeeping rules.',options:[
      ['purchase','A purchase'],['earned_money','Money I earned'],['moved_money','Money moved between accounts'],
      ['paid_card','A credit card payment'],['received_refund','A refund'],['added_own_money','Money I added'],
      ['borrowed_money','Money I borrowed'],
    ].map(([id,label])=>({id,label})),
    ...(economicContext?.confidence === 'narrowed_confirmation' ? {
      prompt: economicContext.context === 'telecom_service'
        ? 'Was this a phone or telecommunications service charge?'
        : 'Was this a restaurant or meal purchase?',
      guidance: 'Confirm what happened. I’ll handle the bookkeeping rules.',
      options: [
        { id: 'purchase', label: economicContext.context === 'telecom_service'
          ? 'Yes, phone service' : 'Yes, a meal' },
        { id: 'moved_money', label: 'No, money moved between accounts' },
        { id: 'paid_card', label: 'No, a credit card payment' },
        { id: 'received_refund', label: 'No, a refund' },
      ],
    } : {}),
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

async function buildCustomerQuestions(input: {
  supabase: SupabaseClient
  scope?:'expenses'|'business'
  asOf: string
  includeNonConversational?: boolean
}) {
  const incoming = await input.supabase.rpc('ensure_current_money_in_questions')
  if (incoming.error) throw new Error('Incoming money questions could not be prepared.')
  const ensured = await input.supabase.rpc('ensure_current_meal_substantiation_questions')
  if (ensured.error && ensured.error.code !== 'PGRST202') throw new Error('Meal substantiation questions could not be prepared.')
  const receiptMeals = await input.supabase.rpc('ensure_current_receipt_meal_candidate_questions')
  if (receiptMeals.error && receiptMeals.error.code !== 'PGRST202') throw new Error('Receipt meal questions could not be prepared.')
  const deductionQuestions = await listDeductionQuestions(input.supabase)
  const contractorQuestions = await listContractorQuestions(input.supabase,input.asOf)
  const [queue,validBookkeepingResult] = await Promise.all([
    listCanonicalReviewQueue(input),
    input.supabase.rpc(input.includeNonConversational?'list_current_evidence_question_event_ids':'list_current_askable_bookkeeping_question_event_ids',{p_as_of:input.asOf}),
  ])
  if(validBookkeepingResult.error)throw new Error('Current bookkeeping questions could not be validated.')
  const validBookkeepingEventIds=new Set((validBookkeepingResult.data??[]).map((row:{event_id:string})=>row.event_id))
  const conversational=input.includeNonConversational?await input.supabase.rpc('list_current_askable_bookkeeping_question_event_ids',{p_as_of:input.asOf}):validBookkeepingResult
  if(conversational.error)throw new Error('Conversational question state could not be loaded.')
  const conversationalIds=new Set((conversational.data??[]).map((row:{event_id:string})=>row.event_id))
  const currentQueue=queue.filter(item=>validBookkeepingEventIds.has(item.event.id))
  const recordIds = [...new Set(currentQueue.map(({ record }) => record.id))]
  if (!recordIds.length) return [...deductionQuestions, ...contractorQuestions]
  const businessId = currentQueue[0].record.businessId
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
      .select('id,merchant_name,original_description,amount_cents,currency,transaction_date,import_method,raw_payload')
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

  const bookkeepingQuestions = currentQueue.flatMap((item) => {
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
    const raw = transaction?.raw_payload && typeof transaction.raw_payload === 'object'
      ? transaction.raw_payload as Record<string, unknown> : {}
    const providerEvidence = raw.provider_evidence && typeof raw.provider_evidence === 'object'
      ? raw.provider_evidence as Record<string, unknown> : {}
    const category = providerEvidence.personal_finance_category
      && typeof providerEvidence.personal_finance_category === 'object'
      ? providerEvidence.personal_finance_category as Record<string, unknown> : {}
    const question = projectCustomerQuestion(item, context, economicContextSignal({
      amountCents: context.amountCents,
      merchantName: transaction?.merchant_name,
      description: transaction?.original_description,
      plaidPrimary: typeof category.primary === 'string' ? category.primary : null,
      plaidDetailed: typeof category.detailed === 'string' ? category.detailed : null,
      receiptMealSupported: item.event.questionContext?.receiptMealCandidateId != null,
    }))
    return question ? [{ ...question, source: 'bookkeeping' as const,recordId:item.record.id,
      openedAt:item.event.createdAt,availableAt:item.event.deferredUntil,
      contextFingerprint:item.event.contextFingerprint,
      nonConversational:!conversationalIds.has(item.event.id),
      materiality:(['BUSINESS_USE_UNCLEAR','MIXED_USE_CLARIFICATION','TRANSACTION_TYPE_UNCLEAR','CONFLICTING_EVIDENCE'].includes(item.event.reason)?'totals':'disclosable') as CustomerQuestion['materiality'],
      evidence:evidenceByRecord.get(item.record.id) }] : []
  })
  return selectCurrentAskableQuestions({bookkeeping:bookkeepingQuestions,deduction:deductionQuestions,
    contractor:contractorQuestions,scope:input.scope??'expenses',asOf:input.asOf})
}

/**
 * Authoritative server-side projection of questions the customer can answer now.
 * It is continuous across dates and deliberately has no Weekly Review period input.
 */
export async function getCurrentAskableQuestionQueue(input: {
  supabase: SupabaseClient
  scope?: 'expenses' | 'business'
  asOf?: string
  includeNonConversational?: boolean
}): Promise<CurrentAskableQuestionQueue> {
  const asOf=input.asOf??new Date().toISOString()
  const questions=await buildCustomerQuestions({...input,asOf})
  const opened=questions.map(question=>question.openedAt).filter((value):value is string=>Boolean(value)).sort()
  return {asOf,count:questions.length,oldestOutstandingAt:opened[0]??null,questions}
}

/** Compatibility contract for existing Weekly Review and /questions consumers. */
export async function listCustomerQuestions(input: {
  includeNonConversational?: boolean
  supabase: SupabaseClient
  scope?: 'expenses' | 'business'
}) {
  return (await getCurrentAskableQuestionQueue(input)).questions
}

async function listContractorQuestions(supabase: SupabaseClient,asOf=new Date().toISOString()): Promise<CustomerQuestion[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('An authenticated user is required.')
  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  if (!business) return []
  const [{ data: payments, error: paymentError }, { data: contractors, error: contractorError },
    { data: w9, error: w9Error },{data:deferrals,error:deferralError}] = await Promise.all([
    supabase.from('current_contractor_payments').select('*').eq('business_id', business.id),
    supabase.from('current_canonical_contractors').select('id,display_name').eq('business_id', business.id),
    supabase.from('current_contractor_w9_status').select('*').eq('business_id', business.id),
    supabase.from('contractor_question_deferral_events')
      .select('question_source,question_id,source_version_id,deferred_until')
      .eq('business_id',business.id).gt('deferred_until',asOf),
  ])
  if (paymentError || contractorError || w9Error || deferralError) throw new Error('Unable to load contractor questions.')
  const deferred=new Set((deferrals??[]).map(row=>`${row.question_source}:${row.question_id}:${row.source_version_id}`))
  const contractorById = new Map((contractors ?? []).map(row => [row.id, row]))
  const questions: CustomerQuestion[] = []
  for (const payment of payments ?? []) if (payment.payment_method === 'unknown'
    &&!deferred.has(`payment_method:${payment.id}:${payment.id}`)) {
    const contractor = contractorById.get(payment.contractor_id)
    questions.push({ id: payment.id, version: payment.id, source: 'contractor', kind: 'factual_choice',
      prompt: `How did you pay ${contractor?.display_name ?? 'this contractor'}?`,
      guidance: 'Choose the factual payment method. WriteOffs will evaluate reporting implications separately.',
      options: [['cash','Cash'],['check','Check'],['ach_zelle','ACH / Zelle'],['payment_card','Payment card'],
        ['third_party_service','Third-party payment service'],['other','Other']].map(([id,label]) => ({ id, label })),
      transaction: { merchant: contractor?.display_name ?? 'Contractor payment', amountCents: Number(payment.amount_cents),
        currency: 'USD', date: payment.paid_on },openedAt:payment.created_at,availableAt:null,
      contextFingerprint:payment.id })
  }
  const contractorsWithPayments = new Set((payments ?? []).map(row => row.contractor_id))
  for (const status of w9 ?? []) if (contractorsWithPayments.has(status.contractor_id) && status.status !== 'on_file'
    &&!deferred.has(`w9_status:${status.id}:${status.id}`)) {
    const contractor = contractorById.get(status.contractor_id)
    questions.push({ id: status.id, version: status.id, source: 'contractor', kind: 'factual_choice',
      prompt: `Do you have a W-9 from ${contractor?.display_name ?? 'this contractor'}?`,
      guidance: 'Do not enter a Social Security number or EIN.',
      options: [{ id: 'on_file', label: 'Yes, it is on file' }, { id: 'needed', label: 'No, I need it' },
        { id: 'needs_attention', label: 'I need to check' }],
      transaction: { merchant: contractor?.display_name ?? 'Contractor', amountCents: null, currency: 'USD', date: null },
      openedAt:status.created_at,availableAt:null,contextFingerprint:status.id })
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
    .select('id,attention_id,event_type,fact_type,bookkeeping_record_id,question_type,prompt,guidance,scope_key,signal_version,created_at')
    .eq('business_id', business.id).eq('event_type', 'opened').order('created_at')
  if (error) throw new Error(`Unable to load deduction questions: ${error.message}`)
  const recordIds = (attentions ?? []).map((row) => row.bookkeeping_record_id).filter(Boolean)
  const {data:vehicles}=await supabase.from('business_vehicles').select('id,display_name').eq('business_id',business.id).is('archived_at',null).order('created_at')
  const { data: records, error: recordsError } = recordIds.length
    ? await supabase.from('bookkeeping_records').select('id,amount_cents,currency,occurred_on')
      .eq('business_id', business.id).in('id', recordIds)
    : { data: [], error: null }
  if (recordsError) throw new Error(`Unable to load deduction question context: ${recordsError.message}`)
  const recordById = new Map((records ?? []).map((row) => [row.id, row]))
  const decisionResult=recordIds.length?await supabase.from('bookkeeping_decisions')
    .select('id,bookkeeping_record_id,supersedes_decision_id,treatment').eq('business_id',business.id).in('bookkeeping_record_id',recordIds):{data:[],error:null}
  if(decisionResult.error)throw new Error('Deduction question ownership state could not be loaded.')
  const supersededDecisions=new Set((decisionResult.data??[]).map(row=>row.supersedes_decision_id).filter(Boolean))
  const nonbusinessRecords=new Set((decisionResult.data??[]).filter(row=>!supersededDecisions.has(row.id)&&['personal','excluded'].includes(row.treatment)).map(row=>row.bookkeeping_record_id))

  return (attentions ?? []).filter(attention=>!attention.bookkeeping_record_id||!nonbusinessRecords.has(attention.bookkeeping_record_id)).map((attention) => {
    const record = attention.bookkeeping_record_id ? recordById.get(attention.bookkeeping_record_id) : null
    return {
      id: attention.attention_id, version: attention.id, source: 'deduction' as const,
      recordId: attention.bookkeeping_record_id ?? undefined,
      kind: attention.question_type as CustomerQuestion['kind'], prompt: attention.prompt,
      ...(attention.fact_type==='vehicle_association'?{options:(vehicles??[]).map(vehicle=>({id:vehicle.id,label:vehicle.display_name}))}:{}),
      guidance: attention.guidance ?? undefined,
      openedAt:attention.created_at,availableAt:null,
      contextFingerprint:`${attention.signal_version}:${attention.id}`,
      transaction: { merchant: attention.bookkeeping_record_id ? attention.scope_key : 'Your business',
        amountCents: record?.amount_cents == null ? null : Number(record.amount_cents),
        currency: record?.currency ?? 'USD', date: record?.occurred_on ?? null },
    }
  })
}
