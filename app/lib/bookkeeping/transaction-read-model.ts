import type { SupabaseClient } from '@supabase/supabase-js'

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
}

type Row = Record<string, unknown>

function text(row: Row, key: string) {
  return typeof row[key] === 'string' ? row[key] as string : null
}

function number(row: Row, key: string) {
  return typeof row[key] === 'number' ? row[key] as number : Number(row[key] ?? 0)
}

function treatmentLabel(decision: Row | undefined) {
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
  limit?: number
}): Promise<TransactionReadRow[]> {
  const { data: business, error: businessError } = await input.supabase.from('businesses')
    .select('id').eq('owner_user_id', input.userId).single()
  if (businessError || !business) throw new Error('Business was not found for the authenticated user.')
  const businessId = business.id as string
  const limit = Math.min(Math.max(input.limit ?? 1000, 1), 1000)
  const start = input.year ? `${input.year}-01-01` : null
  const end = input.year ? `${input.year}-12-31` : null

  let recordQuery = input.supabase.from('bookkeeping_records')
    .select('id,amount_cents,currency,occurred_on').eq('business_id', businessId)
    .order('occurred_on', { ascending: false }).limit(limit)
  if (start && end) recordQuery = recordQuery.gte('occurred_on', start).lte('occurred_on', end)
  const { data: records, error: recordError } = await recordQuery
  if (recordError) throw new Error('Could not list canonical transactions.')
  const recordRows = (records ?? []) as Row[]
  const recordIds = recordRows.map((row) => text(row, 'id')!).filter(Boolean)

  let sources: Row[] = []
  let decisions: Row[] = []
  let documentLinks: Row[] = []
  if (recordIds.length) {
    const [sourceResult, decisionResult, documentResult] = await Promise.all([
      input.supabase.from('bookkeeping_financial_sources')
        .select('bookkeeping_record_id,financial_transaction_id').eq('business_id', businessId)
        .in('bookkeeping_record_id', recordIds).is('revoked_at', null),
      input.supabase.from('bookkeeping_decisions')
        .select('id,bookkeeping_record_id,supersedes_decision_id,treatment,reason,provenance,created_at')
        .eq('business_id', businessId).in('bookkeeping_record_id', recordIds)
        .order('created_at', { ascending: false }),
      input.supabase.from('bookkeeping_document_links')
        .select('bookkeeping_record_id').eq('business_id', businessId)
        .in('bookkeeping_record_id', recordIds).is('revoked_at', null),
    ])
    if (sourceResult.error || decisionResult.error || documentResult.error) {
      const detail = sourceResult.error?.message ?? decisionResult.error?.message
        ?? documentResult.error?.message ?? 'unknown read error'
      throw new Error(`Could not assemble canonical transaction history: ${detail}`)
    }
    sources = (sourceResult.data ?? []) as Row[]
    decisions = (decisionResult.data ?? []) as Row[]
    documentLinks = (documentResult.data ?? []) as Row[]
  }
  const financialIds = sources.map((row) => text(row, 'financial_transaction_id')!).filter(Boolean)
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
  const decisionHistory = new Map<string, Row[]>()
  for (const decision of decisions) {
    const recordId = text(decision, 'bookkeeping_record_id')!
    decisionHistory.set(recordId, [...(decisionHistory.get(recordId) ?? []), decision])
  }
  const documented = new Set(documentLinks.map((row) => text(row, 'bookkeeping_record_id')))
  const canonical: TransactionReadRow[] = recordRows.flatMap((record) => {
    const recordId = text(record, 'id')!
    const source = sourceByRecord.get(recordId)
    const financial = source ? financialById.get(text(source, 'financial_transaction_id')) : undefined
    if (!financial) return []
    const history = decisionHistory.get(recordId) ?? []
    const superseded = new Set(history.map((decision) => text(decision, 'supersedes_decision_id')).filter(Boolean))
    const current = history.find((decision) => !superseded.has(text(decision, 'id')))
    const amountCents = number(financial, 'amount_cents')
    return [{
      id: text(financial, 'id')!, sourceModel: 'canonical' as const,
      date: text(financial, 'transaction_date')!,
      vendor: text(financial, 'merchant_name') ?? text(financial, 'original_description') ?? 'Transaction',
      description: text(financial, 'original_description'), amount: amountCents / 100,
      amountCents, currency: text(financial, 'currency') ?? 'USD', category_key: null,
      has_receipt: documented.has(recordId), receipt_waived: false,
      treatmentLabel: treatmentLabel(current), decisionReason: current ? text(current, 'reason') : null,
      decisionProvenance: current ? text(current, 'provenance') : null,
      correctionCount: Math.max(0, history.length - 1),
    }]
  })

  let legacyQuery = input.supabase.from('transactions')
    .select('id,date,vendor,description,amount,amount_cents,currency,category_key,receipt_waived,created_from_receipt_id,canonical_financial_transaction_id')
    .eq('user_id', input.userId).is('canonical_financial_transaction_id', null)
    .order('date', { ascending: false }).limit(limit)
  if (start && end) legacyQuery = legacyQuery.gte('date', start).lte('date', end)
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
    }
  })
  return [...canonical, ...legacy].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}
