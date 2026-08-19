import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseCanonicalFinancialSummaryRepository } from './financial-summary-repository'
import type { LegacyReportingRecord } from './reporting-model'

type Row = Record<string, unknown>

export class SupabaseCanonicalReportingRepository {
  readonly canonical: SupabaseCanonicalFinancialSummaryRepository
  constructor(private readonly supabase: SupabaseClient) {
    this.canonical = new SupabaseCanonicalFinancialSummaryRepository(supabase)
  }

  async findBusinessIdForUser(userId: string) { return this.canonical.findBusinessIdForUser(userId) }

  async loadCategoryLabels() {
    const { data, error } = await this.supabase.from('categories').select('key,label')
    if (error) throw new Error(`Unable to load supported reporting categories: ${error.message}`)
    return Object.fromEntries((data ?? []).map((row) => [row.key as string, row.label as string]))
  }

  async loadLegacyRecords(input: { userId: string; periodStart: string; periodEnd: string }): Promise<LegacyReportingRecord[]> {
    const rows: Row[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.supabase.from('transactions')
        .select('id,date,vendor,description,amount,amount_cents,currency,category_key,receipt_waived,created_from_receipt_id')
        .eq('user_id', input.userId).is('canonical_financial_transaction_id', null)
        .gte('date', input.periodStart).lte('date', input.periodEnd)
        .order('date', { ascending: true }).range(from, from + 999)
      if (error) throw new Error(`Unable to load historical reporting records: ${error.message}`)
      const page = (data ?? []) as Row[]
      rows.push(...page)
      if (page.length < 1000) break
    }
    const ids = rows.map((row) => String(row.id))
    const receiptTransactions = new Set<string>()
    for (let index = 0; index < ids.length; index += 200) {
      const { data, error } = await this.supabase.from('receipts').select('transaction_id')
        .eq('user_id', input.userId).in('transaction_id', ids.slice(index, index + 200))
      if (error) throw new Error(`Unable to load historical receipt state: ${error.message}`)
      for (const row of (data ?? []) as Row[]) if (row.transaction_id) receiptTransactions.add(String(row.transaction_id))
    }
    return rows.map((row) => {
      const id = String(row.id)
      const storedCents = row.amount_cents == null ? null : Number(row.amount_cents)
      const amountCents = storedCents && Number.isSafeInteger(storedCents)
        ? storedCents : Math.round(Number(row.amount ?? 0) * 100)
      if (!Number.isSafeInteger(amountCents)) throw new Error('Historical amount is outside safe integer cents.')
      return { id, occurredOn: String(row.date), amountCents,
        currency: typeof row.currency === 'string' ? row.currency : 'USD',
        merchant: typeof row.vendor === 'string' && row.vendor.trim() ? row.vendor : 'Transaction',
        description: typeof row.description === 'string' ? row.description : null,
        categoryKey: typeof row.category_key === 'string' ? row.category_key : null,
        hasEvidence: Boolean(row.created_from_receipt_id) || receiptTransactions.has(id),
        receiptLost: row.receipt_waived === true }
    })
  }
}
