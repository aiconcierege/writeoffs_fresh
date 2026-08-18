import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CanonicalSummaryDecision,
  CanonicalSummaryRecord,
} from './financial-summary'

type Row = Record<string, unknown>

function text(row: Row, key: string) {
  const value = row[key]
  if (typeof value !== 'string') throw new Error(`Canonical summary row is missing ${key}.`)
  return value
}

function nullableText(row: Row, key: string) {
  const value = row[key]
  if (value == null) return null
  if (typeof value !== 'string') throw new Error(`Canonical summary row has invalid ${key}.`)
  return value
}

function cents(value: unknown) {
  if (value == null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error('Canonical amount is outside safe integer cents.')
  return parsed
}

async function inBatches<T>(ids: string[], load: (ids: string[]) => Promise<T[]>) {
  const values: T[] = []
  for (let index = 0; index < ids.length; index += 200) {
    values.push(...await load(ids.slice(index, index + 200)))
  }
  return values
}

export interface CanonicalFinancialSummaryRepository {
  findBusinessIdForUser(userId: string): Promise<string | null>
  loadRecords(input: {
    businessId: string
    periodStart: string
    periodEnd: string
  }): Promise<{ records: CanonicalSummaryRecord[]; undatedRecordCount: number }>
}

export class SupabaseCanonicalFinancialSummaryRepository
implements CanonicalFinancialSummaryRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findBusinessIdForUser(userId: string) {
    const { data, error } = await this.supabase.from('businesses').select('id')
      .eq('owner_user_id', userId).maybeSingle()
    if (error) throw new Error(`Unable to resolve financial summary Business: ${error.message}`)
    return data?.id ?? null
  }

  async loadRecords(input: { businessId: string; periodStart: string; periodEnd: string }) {
    const rows: Row[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.supabase.from('bookkeeping_records')
        .select('id,amount_cents,currency,occurred_on')
        .eq('business_id', input.businessId).order('id').range(from, from + 999)
      if (error) throw new Error(`Unable to load canonical summary records: ${error.message}`)
      const page = (data ?? []) as Row[]
      rows.push(...page)
      if (page.length < 1000) break
    }
    const recordIds = rows.map((row) => text(row, 'id'))
    const decisionRows = await inBatches(recordIds, async (ids) => {
      const { data, error } = await this.supabase.from('bookkeeping_decisions')
        .select('id,bookkeeping_record_id,supersedes_decision_id,bookkeeping_nature,treatment')
        .eq('business_id', input.businessId).in('bookkeeping_record_id', ids)
      if (error) throw new Error(`Unable to load canonical summary decisions: ${error.message}`)
      return (data ?? []) as Row[]
    })
    const decisionIds = decisionRows.map((row) => text(row, 'id'))
    const allocationRows = await inBatches(decisionIds, async (ids) => {
      const { data, error } = await this.supabase.from('bookkeeping_allocations')
        .select('id,bookkeeping_record_id,bookkeeping_decision_id,allocation_kind,amount_cents')
        .eq('business_id', input.businessId).in('bookkeeping_decision_id', ids)
      if (error) throw new Error(`Unable to load canonical summary allocations: ${error.message}`)
      return (data ?? []) as Row[]
    })
    const sourceRows = await inBatches(recordIds, async (ids) => {
      const { data, error } = await this.supabase.from('bookkeeping_financial_sources')
        .select('id,bookkeeping_record_id,financial_transaction_id')
        .eq('business_id', input.businessId).in('bookkeeping_record_id', ids).is('revoked_at', null)
      if (error) throw new Error(`Unable to load canonical summary sources: ${error.message}`)
      return (data ?? []) as Row[]
    })
    const transactionIds = sourceRows.map((row) => text(row, 'financial_transaction_id'))
    const transactionRows = await inBatches(transactionIds, async (ids) => {
      const { data, error } = await this.supabase.from('financial_transactions')
        .select('id,amount_cents,currency,transaction_date')
        .eq('business_id', input.businessId).in('id', ids)
      if (error) throw new Error(`Unable to load canonical summary source transactions: ${error.message}`)
      return (data ?? []) as Row[]
    })

    const allocationsByDecision = new Map<string, CanonicalSummaryDecision['allocations']>()
    for (const row of allocationRows) {
      const decisionId = text(row, 'bookkeeping_decision_id')
      const allocations = allocationsByDecision.get(decisionId) ?? []
      allocations.push({
        id: text(row, 'id'),
        kind: text(row, 'allocation_kind') as CanonicalSummaryDecision['allocations'][number]['kind'],
        amountCents: cents(row.amount_cents)!,
      })
      allocationsByDecision.set(decisionId, allocations)
    }
    const decisionsByRecord = new Map<string, CanonicalSummaryDecision[]>()
    for (const row of decisionRows) {
      const recordId = text(row, 'bookkeeping_record_id')
      const decisions = decisionsByRecord.get(recordId) ?? []
      const id = text(row, 'id')
      decisions.push({
        id,
        supersedesDecisionId: nullableText(row, 'supersedes_decision_id'),
        bookkeepingNature: nullableText(row, 'bookkeeping_nature') as CanonicalSummaryDecision['bookkeepingNature'],
        treatment: text(row, 'treatment') as CanonicalSummaryDecision['treatment'],
        allocations: allocationsByDecision.get(id) ?? [],
      })
      decisionsByRecord.set(recordId, decisions)
    }
    const sourceByRecord = new Map(sourceRows.map((row) => [text(row, 'bookkeeping_record_id'), row]))
    const transactionById = new Map(transactionRows.map((row) => [text(row, 'id'), row]))

    return {
      records: rows.map((row) => {
        const id = text(row, 'id')
        const source = sourceByRecord.get(id)
        const transaction = source
          ? transactionById.get(text(source, 'financial_transaction_id'))
          : null
        return {
          id,
          occurredOn: transaction
            ? text(transaction, 'transaction_date')
            : nullableText(row, 'occurred_on'),
          amountCents: transaction ? cents(transaction.amount_cents) : cents(row.amount_cents),
          currency: transaction ? text(transaction, 'currency') : text(row, 'currency'),
          financialSourceAssociationId: source ? text(source, 'id') : null,
          financialTransactionId: source ? text(source, 'financial_transaction_id') : null,
          decisions: decisionsByRecord.get(id) ?? [],
        }
      }),
      undatedRecordCount: 0,
    }
  }
}
