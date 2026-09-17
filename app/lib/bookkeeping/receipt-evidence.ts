import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { visibleReceiptContent, type ReceiptEvidence } from './shared-evidence'

/** Batched and tenant-scoped; shared by assessments and question projection. */
export async function loadReceiptEvidence(input: { db: SupabaseClient; businessId: string;
  links: Array<{ id: string; receipt_id: string }>; hasFinancialSource: boolean }): Promise<ReceiptEvidence[]> {
  const result: ReceiptEvidence[] = []
  const ids = [...new Set(input.links.map(link => link.receipt_id))]
  for (let offset = 0; offset < ids.length; offset += 50) {
    const { data, error } = await input.db.from('current_bookkeeping_receipt_extractions')
      .select('id,business_id,receipt_id,provider,merchant,occurred_on,total_amount_cents,quality_status,raw_payload')
      .eq('business_id', input.businessId).in('receipt_id', ids.slice(offset, offset + 50))
    if (error) throw new Error('RECEIPT_EVIDENCE_LOAD_FAILED')
    for (const row of data ?? []) {
      // Defense in depth for service callers and synthetic repository adapters.
      if (row.business_id !== input.businessId || !ids.includes(row.receipt_id)) continue
      const link = input.links.find(item => item.receipt_id === row.receipt_id)!
      result.push({ source: { kind: 'receipt_extraction', id: row.id,
        basis: row.provider === 'customer' ? 'customer_supplied' : 'observed',
        provider: row.provider, confidence: null },
        receiptId: row.receipt_id, linkId: link.id, quality: row.quality_status,
        merchant: row.merchant, date: row.occurred_on, totalCents: row.total_amount_cents == null ? null : Number(row.total_amount_cents),
        content: visibleReceiptContent(row.raw_payload?.extractedText),
        matchState: input.hasFinancialSource ? 'linked_to_financial_activity' : 'receipt_only' })
    }
  }
  return result
}
