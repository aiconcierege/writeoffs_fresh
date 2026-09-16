import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { currentPlaidFinancialState, plaidFinancialTransactionIsCurrent } from '../plaid/current-sources'
import { SupabaseBookkeepingRepository } from './supabase-repository'
import { loadCurrentRecordConvergences } from './current-record-resolution'
import {
  BOOKKEEPING_EVALUATOR_VERSION,
  type BookkeepingEvaluationSnapshot,
  type MovementEvidence,
  type StructuralMovementHint,
} from './deterministic-evaluator'

type Row = Record<string, unknown>

function object(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
}

function text(value: unknown) { return typeof value === 'string' ? value : null }

function structuralHint(transaction: Row): StructuralMovementHint {
  if (transaction.import_method !== 'provider') return null
  const raw = object(transaction.raw_payload)
  if (raw.provider !== 'plaid') return null
  const evidence = object(raw.provider_evidence)
  const category = object(evidence.personal_finance_category)
  const primary = text(category.primary)?.toUpperCase() ?? ''
  const detailed = text(category.detailed)?.toUpperCase() ?? ''
  if (primary === 'LOAN_PAYMENTS' && detailed.includes('CREDIT_CARD_PAYMENT')) {
    return 'credit_card_payment'
  }
  if ((primary === 'TRANSFER_IN' || primary === 'TRANSFER_OUT')
    && detailed.includes('ACCOUNT_TRANSFER')) return 'account_transfer'
  return null
}

function personalFinanceCategory(transaction: Row) {
  if (transaction.import_method !== 'provider') return null
  const raw = object(transaction.raw_payload)
  if (raw.provider !== 'plaid') return null
  const category = object(object(raw.provider_evidence).personal_finance_category)
  return { primary: text(category.primary), detailed: text(category.detailed) }
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export async function loadBookkeepingEvaluationSnapshot(input: {
  admin: SupabaseClient
  businessId: string
  recordId: string
}): Promise<BookkeepingEvaluationSnapshot> {
  const { admin, businessId } = input
  const resolution = await loadCurrentRecordConvergences({ supabase: admin, businessId })
  const recordId = resolution.resolve(input.recordId)
  if (resolution.isInactive(recordId)) throw new Error('BOOKKEEPING_RECORD_INACTIVE')
  const evidenceRecordIds = resolution.evidenceRecordIds(recordId)
  const convergence = resolution.convergences.find((item) =>
    item.survivorRecordId === recordId) ?? null
  const compoundComponent = resolution.compoundComponent(recordId)
  const repository = new SupabaseBookkeepingRepository(admin)
  const currentDecision = await repository.findCurrentDecision(businessId, recordId)
  if (!currentDecision) throw new Error('CURRENT_DECISION_UNAVAILABLE')

  const { data: record, error: recordError } = await admin.from('bookkeeping_records')
    .select('id,business_id,source_kind,amount_cents,currency,occurred_on')
    .eq('id', recordId).eq('business_id', businessId).maybeSingle()
  if (recordError || !record) throw new Error('BOOKKEEPING_RECORD_UNAVAILABLE')

  const [businessResult, sourceResult, decisionsResult, reviewResult, documentsResult, mealResult] = await Promise.all([
    admin.from('businesses').select('business_description').eq('id', businessId).maybeSingle(),
    admin.from('bookkeeping_financial_sources')
      .select('financial_transaction_id').eq('business_id', businessId)
      .eq('bookkeeping_record_id', recordId).is('revoked_at', null).maybeSingle(),
    admin.from('bookkeeping_decisions').select('id,provenance').eq('business_id', businessId)
      .eq('bookkeeping_record_id', recordId),
    admin.from('bookkeeping_review_events')
      .select('id,supersedes_event_id,event_type,reason').eq('business_id', businessId)
      .eq('bookkeeping_record_id', recordId),
    admin.from('bookkeeping_document_links').select('id,receipt_id').eq('business_id', businessId)
      .in('bookkeeping_record_id', evidenceRecordIds).is('revoked_at', null),
    admin.from('bookkeeping_receipt_meal_candidates').select('id,receipt_id')
      .eq('business_id', businessId),
  ])
  if (businessResult.error || sourceResult.error || decisionsResult.error
    || reviewResult.error || documentsResult.error || (mealResult.error && mealResult.error.code !== '42P01')) {
    throw new Error('BOOKKEEPING_EVIDENCE_UNAVAILABLE')
  }
  const receiptIds = new Set((mealResult.data ?? []).map((row) => String(row.receipt_id)))
  const activeDocuments = (documentsResult.data ?? []) as Row[]
  const activeReceiptIds = activeDocuments.map((row) => String(row.receipt_id))
  const { data: customerUploads, error: customerUploadsError } = activeReceiptIds.length
    ? await admin.from('bookkeeping_receipt_events').select('id,receipt_id')
      .eq('business_id', businessId).in('receipt_id', activeReceiptIds)
      .eq('event_type', 'uploaded').eq('provenance', 'user').not('actor_user_id', 'is', null)
    : { data: [], error: null }
  if (customerUploadsError) throw new Error('BOOKKEEPING_EVIDENCE_UNAVAILABLE')
  const uploadByReceipt = new Map((customerUploads ?? []).map((row) => [String(row.receipt_id), String(row.id)]))
  const { data: mealLinks, error: mealLinksError } = receiptIds.size
    ? await admin.from('bookkeeping_document_links').select('receipt_id')
      .eq('business_id', businessId).in('bookkeeping_record_id', evidenceRecordIds)
      .in('receipt_id', [...receiptIds]).is('revoked_at', null)
    : { data: [], error: null }
  if (mealLinksError) throw new Error('BOOKKEEPING_EVIDENCE_UNAVAILABLE')

  const reviewEvents = (reviewResult.data ?? []) as Row[]
  const supersededReviewEvents = new Set(reviewEvents.map((event) => event.supersedes_event_id).filter(Boolean))
  const currentReviewEvents = reviewEvents.filter((event) => !supersededReviewEvents.has(event.id))
  const base = {
    evaluatorVersion: BOOKKEEPING_EVALUATOR_VERSION,
    businessId,
    recordId,
    convergenceEventId: convergence?.eventId ?? compoundComponent?.eventId ?? null,
    sourceKind: record.source_kind as BookkeepingEvaluationSnapshot['sourceKind'],
    amountCents: record.amount_cents == null ? null : Number(record.amount_cents),
    currency: String(record.currency),
    occurredOn: text(record.occurred_on),
    merchantName: null,
    description: null,
    businessDescription: text(businessResult.data?.business_description),
    activeDocumentCount: activeDocuments.length,
    customerProvidedReceipts: activeDocuments.flatMap((link) => {
      const receiptId = String(link.receipt_id)
      const uploadEventId = uploadByReceipt.get(receiptId)
      return uploadEventId ? [{ receiptId, documentLinkId: String(link.id), uploadEventId }] : []
    }),
    accountUse: null,
    customerAnswerCount: reviewEvents.filter((event) => event.event_type === 'answered').length,
    hasOpenConflictingEvidence: currentReviewEvents.some((event) =>
      event.reason === 'CONFLICTING_EVIDENCE' && event.event_type !== 'resolved'),
    decisionHistoryLength: decisionsResult.data?.length ?? 0,
    customerFactsAuthoritative: currentDecision.provenance === 'user' || (Boolean(currentDecision.reason?.startsWith('Schedule C operating-expense classification:'))
      && Boolean(decisionsResult.data?.some(row => row.provenance === 'user'))),
    currentDecision,
    movement: null,
    movementCandidates: [],
    personalFinanceCategory: null,
    receiptMealSupported: Boolean(mealLinks?.length),
  } satisfies BookkeepingEvaluationSnapshot
  const financialTransactionId = sourceResult.data?.financial_transaction_id
    ?? compoundComponent?.financialTransactionId
  if (!financialTransactionId || !base.occurredOn) return base

  const { data: transaction, error: transactionError } = await admin.from('financial_transactions')
    .select('id,business_id,financial_account_id,merchant_name,original_description,amount_cents,currency,transaction_date,pending,import_method,raw_payload')
    .eq('business_id', businessId).eq('id', financialTransactionId).maybeSingle()
  if (transactionError || !transaction) throw new Error('BOOKKEEPING_SOURCE_UNAVAILABLE')
  const { data: candidates, error: candidatesError } = await admin.from('financial_transactions')
    .select('id,business_id,financial_account_id,merchant_name,original_description,amount_cents,currency,transaction_date,pending,import_method,raw_payload')
    .eq('business_id', businessId).eq('currency', transaction.currency)
    .gte('transaction_date', shiftDate(transaction.transaction_date, -3))
    .lte('transaction_date', shiftDate(transaction.transaction_date, 3))
  if (candidatesError) throw new Error('BOOKKEEPING_SOURCE_UNAVAILABLE')
  const transactions = (candidates ?? []) as Row[]
  const accountIds = [...new Set(transactions.map((candidate) => String(candidate.financial_account_id)))]
  const { data: accounts, error: accountsError } = await admin.from('financial_accounts')
    .select('id,business_id,account_type,connection_status,archived_at,provider')
    .eq('business_id', businessId).in('id', accountIds)
  if (accountsError) throw new Error('BOOKKEEPING_SOURCE_UNAVAILABLE')
  const { data: accountUses, error: accountUsesError } = await admin.from('current_financial_account_use')
    .select('id,financial_account_id,designation,effective_at').eq('business_id', businessId)
    .in('financial_account_id', accountIds)
  if (accountUsesError && accountUsesError.code !== '42P01') throw new Error('BOOKKEEPING_SOURCE_UNAVAILABLE')
  const accountUseById = new Map((accountUses ?? []).map((use) => [String(use.financial_account_id), use]))
  const accountById = new Map((accounts ?? []).map((account) => [account.id, account]))
  const sourceState = await currentPlaidFinancialState({
    supabase: admin,
    businessId,
    candidateFinancialTransactionIds: transactions.map((candidate) => String(candidate.id)),
  })
  const transactionIds = transactions.map((candidate) => String(candidate.id))
  const { data: sourceLinks, error: sourceLinksError } = await admin
    .from('bookkeeping_financial_sources')
    .select('financial_transaction_id,bookkeeping_record_id')
    .eq('business_id', businessId).in('financial_transaction_id', transactionIds)
    .is('revoked_at', null)
  if (sourceLinksError) throw new Error('BOOKKEEPING_SOURCE_UNAVAILABLE')
  const candidateRecordIds = (sourceLinks ?? []).map((link) => String(link.bookkeeping_record_id))
  const { data: candidateDecisions, error: candidateDecisionsError } = candidateRecordIds.length
    ? await admin.from('bookkeeping_decisions')
      .select('id,bookkeeping_record_id,supersedes_decision_id,bookkeeping_nature,treatment,provenance')
      .eq('business_id', businessId).in('bookkeeping_record_id', candidateRecordIds)
    : { data: [], error: null }
  if (candidateDecisionsError) throw new Error('BOOKKEEPING_SOURCE_UNAVAILABLE')
  const decisionRows = (candidateDecisions ?? []) as Row[]
  const supersededDecisions = new Set(decisionRows.map((decision) => decision.supersedes_decision_id).filter(Boolean))
  const currentDecisionByRecord = new Map(decisionRows
    .filter((decision) => !supersededDecisions.has(decision.id))
    .map((decision) => [String(decision.bookkeeping_record_id), decision]))
  const recordByTransaction = new Map((sourceLinks ?? []).map((link) => [
    String(link.financial_transaction_id), String(link.bookkeeping_record_id),
  ]))
  const movements = transactions.flatMap((candidate): MovementEvidence[] => {
    const account = accountById.get(candidate.financial_account_id)
    if (!account || account.archived_at != null || !['checking', 'savings', 'credit_card'].includes(account.account_type)) {
      return []
    }
    const candidateDecision = currentDecisionByRecord.get(
      recordByTransaction.get(String(candidate.id)) ?? '',
    )
    return [{
      financialTransactionId: String(candidate.id),
      financialAccountId: String(candidate.financial_account_id),
      accountType: account.account_type as MovementEvidence['accountType'],
      amountCents: Number(candidate.amount_cents),
      currency: String(candidate.currency),
      occurredOn: String(candidate.transaction_date),
      sourceCurrent: plaidFinancialTransactionIsCurrent({ id: String(candidate.id), state: sourceState }),
      pending: candidate.pending === true,
      structuralHint: structuralHint(candidate),
      currentDecisionNature: text(candidateDecision?.bookkeeping_nature),
      currentDecisionTreatment: text(candidateDecision?.treatment),
      currentDecisionProvenance: text(candidateDecision?.provenance),
    }]
  })
  const movement = movements.find((candidate) =>
    candidate.financialTransactionId === transaction.id) ?? null
  return {
    ...base,
    amountCents: compoundComponent ? base.amountCents : Number(transaction.amount_cents),
    currency: compoundComponent ? base.currency : String(transaction.currency),
    occurredOn: compoundComponent ? base.occurredOn : String(transaction.transaction_date),
    merchantName: text(transaction.merchant_name),
    description: text(transaction.original_description),
    personalFinanceCategory: personalFinanceCategory(transaction),
    movement: compoundComponent ? null : movement,
    movementCandidates: compoundComponent ? [] : movements.filter((candidate) =>
      candidate.financialTransactionId !== transaction.id),
    accountProvider: accountById.get(String(transaction.financial_account_id))?.provider ?? null,
    accountUse: (() => {
      const use = accountUseById.get(String(transaction.financial_account_id))
      return use && (use.designation === 'business_only' || use.designation === 'business_and_personal') ? {
        eventId: String(use.id), designation: use.designation, effectiveAt: String(use.effective_at),
      } : null
    })(),
  }
}
