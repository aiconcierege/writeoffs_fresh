import type { SupabaseClient } from '@supabase/supabase-js'
import { currentPlaidFinancialState, plaidFinancialTransactionIsCurrent } from '../plaid/current-sources'
import { loadCurrentRecordConvergences } from './current-record-resolution'

export type TransactionReadRow = {
  id: string
  sourceModel: 'canonical' | 'legacy'
  date: string
  vendor: string
  description: string | null
  amount: number
  amountCents: number
  currency: string
  category_key: string | null
  has_receipt: boolean
  receipt_waived: boolean
  treatmentLabel: string
  decisionReason: string | null
  decisionProvenance: string | null
  correctionCount: number
  recordId: string | null
  currentDecisionId: string | null
  bookkeepingNature: string | null
  treatment: string | null
  history: TransactionHistoryItem[]
  evidenceLinks: TransactionEvidenceLink[]
  receiptLost: boolean
  sourceLabel: string | null
  sourceKind: string | null
  contractorName: string | null
}

export type TransactionHistoryItem = {
  id: string
  summary: string
  explanation: string | null
  createdAt: string
}

export type TransactionEvidenceLink = { id: string; receiptId: string; attachedAt: string }

type Row = Record<string, unknown>

function text(row: Row, key: string) {
  return typeof row[key] === 'string' ? row[key] as string : null
}

function number(row: Row, key: string) {
  return typeof row[key] === 'number' ? row[key] as number : Number(row[key] ?? 0)
}

export function customerTreatmentLabel(decision: Row | undefined) {
  if (!decision || text(decision, 'treatment') === 'unresolved') return 'Still being worked on'
  switch (text(decision, 'treatment')) {
    case 'business': return 'Business'
    case 'personal': return 'Personal'
    case 'mixed_use': return 'Business and personal'
    case 'excluded': return 'Not counted in business totals'
    default: return 'Still being worked on'
  }
}

export async function listTransactionReadModel(input: {
  supabase: SupabaseClient
  userId: string
  year?: number | null
  start?: string | null
  end?: string | null
  limit?: number
  transactionId?: string
  after?: { date: string; id: string } | null
}): Promise<TransactionReadRow[]> {
  const { data: business, error: businessError } = await input.supabase.from('businesses')
    .select('id').eq('owner_user_id', input.userId).single()
  if (businessError || !business) throw new Error('Business was not found for the authenticated user.')
  const businessId = business.id as string
  const resolution = await loadCurrentRecordConvergences({
    supabase: input.supabase, businessId,
  })
  const limit = Math.min(Math.max(input.limit ?? 1000, 1), 1000)
  const start = input.start ?? (input.year ? `${input.year}-01-01` : null)
  const end = input.end ?? (input.year ? `${input.year}-12-31` : null)

  let canonicalRecordIds: string[] = []
  if (input.transactionId) {
    canonicalRecordIds = resolution.compoundComponents
      .filter((component) => component.financialTransactionId === input.transactionId
        || component.recordId === input.transactionId)
      .map((component) => component.recordId)
    const { data } = await input.supabase.from('bookkeeping_financial_sources')
      .select('bookkeeping_record_id').eq('business_id', businessId)
      .eq('financial_transaction_id', input.transactionId).is('revoked_at', null).maybeSingle()
    if (!canonicalRecordIds.length && data?.bookkeeping_record_id) {
      canonicalRecordIds = [data.bookkeeping_record_id]
    }
  }
  const recordRows: Row[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    let recordQuery = input.supabase.from('bookkeeping_records')
      .select('id,source_kind,amount_cents,currency,occurred_on').eq('business_id', businessId)
      .order('occurred_on', { ascending: false }).order('id', { ascending: false })
      .range(from, from + pageSize - 1)
    if (start && end) recordQuery = recordQuery.gte('occurred_on', start).lte('occurred_on', end)
    if (input.transactionId) recordQuery = canonicalRecordIds.length
      ? recordQuery.in('id', canonicalRecordIds) : recordQuery.eq('id', input.transactionId)
    const { data: records, error: recordError } = await recordQuery
    if (recordError) throw new Error('Could not list canonical transactions.')
    recordRows.push(...((records ?? []) as Row[]))
    if (input.transactionId || (records?.length ?? 0) < pageSize) break
  }
  const recordIds = recordRows.map((row) => text(row, 'id')!).filter(Boolean)
  const evidenceRecordIds = [...new Set(recordIds.flatMap((recordId) =>
    resolution.evidenceRecordIds(recordId)))]

  let sources: Row[] = []
  let manualEvents: Row[] = []
  let decisions: Row[] = []
  let documentLinks: Row[] = []
  let invoiceLinks: Row[] = []
  if (recordIds.length) {
    const [sourceResult, decisionResult, documentResult, manualResult, invoiceResult] = await Promise.all([
      input.supabase.from('bookkeeping_financial_sources')
        .select('bookkeeping_record_id,financial_transaction_id').eq('business_id', businessId)
        .in('bookkeeping_record_id', recordIds).is('revoked_at', null),
      input.supabase.from('bookkeeping_decisions')
        .select('id,bookkeeping_record_id,supersedes_decision_id,bookkeeping_nature,treatment,review_status,reason,provenance,created_at')
        .eq('business_id', businessId).in('bookkeeping_record_id', recordIds)
        .order('created_at', { ascending: false }),
      input.supabase.from('bookkeeping_document_links')
        .select('id,bookkeeping_record_id,receipt_id,linked_at').eq('business_id', businessId)
        .in('bookkeeping_record_id', evidenceRecordIds).is('revoked_at', null),
      input.supabase.from('current_manual_financial_activity')
        .select('manual_financial_source_id,bookkeeping_record_id,direction,payment_method,counterparty_name,description,job_label,location,note')
        .eq('business_id', businessId).in('bookkeeping_record_id', recordIds),
      input.supabase.from('invoice_income_links')
        .select('invoice_id,bookkeeping_record_id').eq('business_id', businessId)
        .in('bookkeeping_record_id', recordIds),
    ])
    if (sourceResult.error || decisionResult.error || documentResult.error || manualResult.error || invoiceResult.error) {
      const detail = sourceResult.error?.message ?? decisionResult.error?.message
        ?? documentResult.error?.message ?? manualResult.error?.message
        ?? invoiceResult.error?.message ?? 'unknown read error'
      throw new Error(`Could not assemble canonical transaction history: ${detail}`)
    }
    sources = (sourceResult.data ?? []) as Row[]
    sources.push(...resolution.compoundComponents
      .filter((component) => recordIds.includes(component.recordId))
      .map((component) => ({
        bookkeeping_record_id: component.recordId,
        financial_transaction_id: component.financialTransactionId,
        compound_component: true,
        relationship_role: component.relationshipRole,
      })))
    decisions = (decisionResult.data ?? []) as Row[]
    documentLinks = (documentResult.data ?? []) as Row[]
    manualEvents = (manualResult.data ?? []) as Row[]
    invoiceLinks = (invoiceResult.data ?? []) as Row[]
  }
  const financialIds = sources.map((row) => text(row, 'financial_transaction_id')!).filter(Boolean)
  const plaidState = await currentPlaidFinancialState({
    supabase: input.supabase, businessId, candidateFinancialTransactionIds: financialIds,
  })
  let financialRows: Row[] = []
  if (financialIds.length) {
    const { data, error } = await input.supabase.from('financial_transactions')
      .select('id,merchant_name,original_description,amount_cents,currency,transaction_date')
      .eq('business_id', businessId).in('id', financialIds)
    if (error) throw new Error('Could not load canonical financial source facts.')
    financialRows = (data ?? []) as Row[]
  }
  const financialById = new Map(financialRows.map((row) => [text(row, 'id'), row]))
  const sourceByRecord = new Map(sources.map((row) => [text(row, 'bookkeeping_record_id'), row]))
  const manualByRecord = new Map(manualEvents.map((row) => [text(row, 'bookkeeping_record_id'), row]))
  const invoiceIds = invoiceLinks.map((row) => text(row, 'invoice_id')!).filter(Boolean)
  let invoiceRows: Row[] = []
  if (invoiceIds.length) {
    const { data, error } = await input.supabase.from('current_canonical_invoices')
      .select('id,invoice_number,customer_name,description,job_label')
      .eq('business_id', businessId).in('id', invoiceIds)
    if (error) throw new Error('Could not load invoice context for transactions.')
    invoiceRows = (data ?? []) as Row[]
  }
  const invoiceById = new Map(invoiceRows.map((row) => [text(row, 'id'), row]))
  const invoiceByRecord = new Map(invoiceLinks.map((row) => [
    text(row, 'bookkeeping_record_id'), invoiceById.get(text(row, 'invoice_id')),
  ]))
  const decisionHistory = new Map<string, Row[]>()
  for (const decision of decisions) {
    const recordId = text(decision, 'bookkeeping_record_id')!
    decisionHistory.set(recordId, [...(decisionHistory.get(recordId) ?? []), decision])
  }
  const documented = new Set(documentLinks.map((row) =>
    resolution.resolve(text(row, 'bookkeeping_record_id')!)))
  let documentationEvents: Row[] = []
  let receiptExtractions: Row[] = []
  if (evidenceRecordIds.length) {
    const { data } = await input.supabase.from('bookkeeping_documentation_events')
      .select('bookkeeping_record_id,event_type').eq('business_id', businessId)
      .in('bookkeeping_record_id', evidenceRecordIds)
    documentationEvents = (data ?? []) as Row[]
  }
  const receiptLostRecords = new Set(documentationEvents
    .filter((row) => text(row, 'event_type') === 'receipt_lost')
    .map((row) => resolution.resolve(text(row, 'bookkeeping_record_id')!)))
  const linkedReceiptIds = documentLinks.map((link) => text(link, 'receipt_id')!).filter(Boolean)
  if (linkedReceiptIds.length) {
    const { data } = await input.supabase.from('bookkeeping_receipt_extractions')
      .select('receipt_id,merchant,occurred_on,total_amount_cents,created_at')
      .eq('business_id', businessId).in('receipt_id', linkedReceiptIds)
      .order('created_at', { ascending: false })
    receiptExtractions = (data ?? []) as Row[]
  }
  const extractionByReceipt = new Map<string, Row>()
  for (const extraction of receiptExtractions) {
    const receiptId = text(extraction, 'receipt_id')!
    if (!extractionByReceipt.has(receiptId)) extractionByReceipt.set(receiptId, extraction)
  }
  let contractorPayments: Row[] = []
  if (evidenceRecordIds.length) {
    const { data, error } = await input.supabase.from('current_contractor_payments')
      .select('bookkeeping_record_id,contractor_id').eq('business_id', businessId)
      .in('bookkeeping_record_id', evidenceRecordIds)
    if (error) throw new Error('Could not load contractor payment context.')
    contractorPayments = (data ?? []) as Row[]
  }
  const contractorIds = contractorPayments.map(row => text(row, 'contractor_id')!).filter(Boolean)
  const { data: contractorRows, error: contractorError } = contractorIds.length
    ? await input.supabase.from('current_canonical_contractors').select('id,display_name')
      .eq('business_id', businessId).in('id', contractorIds)
    : { data: [], error: null }
  if (contractorError) throw new Error('Could not load contractor names.')
  const contractorNameById = new Map((contractorRows ?? []).map(row => [row.id, row.display_name]))
  const contractorByRecord = new Map(contractorPayments.map(row => [
    resolution.resolve(text(row, 'bookkeeping_record_id')!), contractorNameById.get(text(row, 'contractor_id')!),
  ]))
  const canonical: TransactionReadRow[] = recordRows.flatMap((record) => {
    const recordId = text(record, 'id')!
    if (resolution.isAbsorbed(recordId) || resolution.isInactive(recordId)) return []
    const source = sourceByRecord.get(recordId)
    const financial = source ? financialById.get(text(source, 'financial_transaction_id')) : undefined
    const compoundComponent = source?.compound_component === true
    const sourceKind = text(record, 'source_kind')
    const manual = manualByRecord.get(recordId)
    const invoice = invoiceByRecord.get(recordId)
    const baseSourceLabel = compoundComponent ? 'Part of bank activity' : financial ? null : 'Receipt only'
    const receiptLink = documentLinks.find((link) =>
      resolution.resolve(text(link, 'bookkeeping_record_id')!) === recordId)
    const receiptExtraction = receiptLink ? extractionByReceipt.get(text(receiptLink, 'receipt_id')!) : undefined
    if (!financial && sourceKind !== 'receipt' && !manual) return []
    if (financial && !plaidFinancialTransactionIsCurrent({ id: text(financial, 'id')!, state: plaidState })) return []
    const history = decisionHistory.get(recordId) ?? []
    const superseded = new Set(history.map((decision) => text(decision, 'supersedes_decision_id')).filter(Boolean))
    const current = history.find((decision) => !superseded.has(text(decision, 'id')))
    const amountCents = financial && !compoundComponent
      ? number(financial, 'amount_cents') : number(record, 'amount_cents')
    return [{
      id: financial && !compoundComponent ? text(financial, 'id')! : recordId, sourceModel: 'canonical' as const,
      date: financial && !compoundComponent ? text(financial, 'transaction_date')! : text(record, 'occurred_on')!,
      vendor: invoice ? text(invoice, 'customer_name') ?? 'Customer payment'
        : financial ? text(financial, 'merchant_name') ?? text(financial, 'original_description') ?? 'Transaction'
        : manual ? text(manual, 'counterparty_name') ?? (text(manual, 'direction') === 'received' ? 'Money received' : 'Money spent')
          : text(receiptExtraction ?? {}, 'merchant') ?? 'Receipt purchase',
      description: invoice ? text(invoice, 'description')
        : financial ? text(financial, 'original_description')
          : manual ? text(manual, 'description') : 'Recorded from a receipt', amount: amountCents / 100,
      amountCents, currency: financial && !compoundComponent ? text(financial, 'currency') ?? 'USD' : text(record, 'currency') ?? 'USD', category_key: null,
      has_receipt: documented.has(recordId), receipt_waived: false,
      treatmentLabel: customerTreatmentLabel(current), decisionReason: current ? text(current, 'reason') : null,
      decisionProvenance: current ? text(current, 'provenance') : null,
      correctionCount: Math.max(0, history.length - 1),
      recordId, currentDecisionId: current ? text(current, 'id') : null,
      bookkeepingNature: current ? text(current, 'bookkeeping_nature') : null,
      treatment: current ? text(current, 'treatment') : null,
      history: history.map((decision) => ({
        id: text(decision, 'id')!, summary: customerTreatmentLabel(decision),
        explanation: text(decision, 'reason'), createdAt: text(decision, 'created_at')!,
      })),
      evidenceLinks: documentLinks.filter((link) =>
        resolution.resolve(text(link, 'bookkeeping_record_id')!) === recordId)
        .map((link) => ({ id: text(link, 'id')!, receiptId: text(link, 'receipt_id')!,
          attachedAt: text(link, 'linked_at')! })),
      receiptLost: receiptLostRecords.has(recordId),
      sourceLabel: invoice
        ? [baseSourceLabel, `Invoice ${text(invoice, 'invoice_number')}`].filter(Boolean).join(' · ')
        : manual && !compoundComponent
          ? `Recorded · ${manualPaymentLabel(text(manual, 'payment_method'))}` : baseSourceLabel,
      sourceKind,
      contractorName: contractorByRecord.get(recordId) ?? null,
    }]
  })

  let legacyQuery = input.supabase.from('transactions')
    .select('id,date,vendor,description,amount,amount_cents,currency,category_key,receipt_waived,created_from_receipt_id,canonical_financial_transaction_id')
    .eq('user_id', input.userId).is('canonical_financial_transaction_id', null)
    .order('date', { ascending: false }).limit(limit)
  if (start && end) legacyQuery = legacyQuery.gte('date', start).lte('date', end)
  if (input.transactionId) legacyQuery = legacyQuery.eq('id', input.transactionId)
  const { data: legacyData, error: legacyError } = await legacyQuery
  if (legacyError) throw new Error('Could not list legacy transactions.')
  const legacyRows = (legacyData ?? []) as Row[]
  const legacyIds = legacyRows.map((row) => text(row, 'id')!).filter(Boolean)
  const legacyReceipts = new Set<string>()
  if (legacyIds.length) {
    const { data, error } = await input.supabase.from('receipts')
      .select('transaction_id').in('transaction_id', legacyIds)
    if (error) throw new Error('Could not load legacy receipt state.')
    for (const row of (data ?? []) as Row[]) legacyReceipts.add(text(row, 'transaction_id')!)
  }
  const legacy: TransactionReadRow[] = legacyRows.map((row) => {
    const amountCents = row.amount_cents == null ? Math.round(number(row, 'amount') * 100) : number(row, 'amount_cents')
    return {
      id: text(row, 'id')!, sourceModel: 'legacy', date: text(row, 'date')!,
      vendor: text(row, 'vendor') ?? 'Transaction', description: text(row, 'description'),
      amount: amountCents / 100, amountCents, currency: text(row, 'currency') ?? 'USD',
      category_key: text(row, 'category_key'),
      has_receipt: Boolean(text(row, 'created_from_receipt_id')) || legacyReceipts.has(text(row, 'id')!),
      receipt_waived: row.receipt_waived === true,
      treatmentLabel: text(row, 'category_key') ? 'Legacy category recorded' : 'Legacy record',
      decisionReason: null, decisionProvenance: null, correctionCount: 0,
      recordId: null, currentDecisionId: null, bookkeepingNature: null,
      treatment: null, history: [], evidenceLinks: [], receiptLost: row.receipt_waived === true,
      sourceLabel: null,
      sourceKind: null,
      contractorName: null,
    }
  })
  const current = [...canonical, ...legacy].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .filter((row) => !input.after || row.date < input.after.date
      || (row.date === input.after.date && row.id < input.after.id))
  return current.slice(0, limit)
}

export function transactionCursor(row: Pick<TransactionReadRow,'date'|'id'>) {
  return Buffer.from(`${row.date}\n${row.id}`,'utf8').toString('base64url')
}

export function parseTransactionCursor(value: unknown) {
  if (typeof value!=='string' || value.length>200) return null
  try { const [date,id,...extra]=Buffer.from(value,'base64url').toString('utf8').split('\n')
    return extra.length===0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^[0-9a-f-]{36}$/i.test(id) ? {date,id} : null
  } catch { return null }
}

function manualPaymentLabel(value: string | null) {
  return ({ cash: 'Cash', check: 'Check', zelle_ach: 'Zelle / ACH', card: 'Card',
    personal_card_account: 'Personal card/account', other: 'Other' } as Record<string, string>)[value ?? ''] ?? 'Other'
}

export async function getTransactionDetailReadModel(input: {
  supabase: SupabaseClient
  userId: string
  transactionId: string
}) {
  const rows = await listTransactionReadModel({ supabase: input.supabase,
    userId: input.userId, limit: 1, transactionId: input.transactionId })
  return rows.find((row) => row.id === input.transactionId) ?? null
}
