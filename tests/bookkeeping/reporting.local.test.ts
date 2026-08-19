import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'
import { resolveFinancialTransactionRecord } from '../../app/lib/bookkeeping/financial-transaction-workflow'
import { CanonicalBookkeepingService } from '../../app/lib/bookkeeping/service'
import { SupabaseBookkeepingRepository } from '../../app/lib/bookkeeping/supabase-repository'
import { correctCanonicalTransactionUse } from '../../app/lib/bookkeeping/transaction-corrections'
import { getAuthenticatedCanonicalReport } from '../../app/lib/bookkeeping/reporting-service'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const suite = enabled ? describe : describe.skip

suite('canonical reporting against local PostgreSQL', () => {
  it('uses current exact allocations, suppresses correlated legacy, and isolates tenants', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'report-owner', amounts: [-10_000] })
    const other = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'report-other', amounts: [-90_000] })
    const initial = await resolveFinancialTransactionRecord({ supabase: owner.customer,
      financialTransactionId: owner.transactionIds[0] })
    const service = new CanonicalBookkeepingService(new SupabaseBookkeepingRepository(owner.customer))
    const established = await service.recordDecision({ actor: { businessId: owner.businessId,
      userId: owner.userId, provenance: 'user' }, recordId: initial.record.id,
      expectedCurrentDecisionId: initial.decision.id, decision: { bookkeepingNature: 'expense',
        treatment: 'business', reviewStatus: 'resolved', reason: 'Customer business fact.',
        allocations: [{ kind: 'business', amountCents: -10_000, taxCategoryKey: null }] } })
    await correctCanonicalTransactionUse({ supabase: owner.customer,
      financialTransactionId: owner.transactionIds[0], expectedCurrentDecisionId: established.id,
      correctionRequestId: crypto.randomUUID(), answer: { schemaVersion: 1, use: 'mixed', personalAmountCents: 3_000 } })
    const report = await getAuthenticatedCanonicalReport({ supabase: owner.customer,
      periodStart: '2026-01-01', periodEnd: '2026-12-31' })
    expect(report.businessExpensesCents).toBe(7_000)
    expect(report.rows.filter((row) => row.sourceModel === 'canonical')).toHaveLength(1)
    expect(report.rows).not.toContainEqual(expect.objectContaining({ signedAmountCents: -90_000 }))
    expect(report.rows[0]).toMatchObject({ businessAmountCents: 7_000, personalAmountCents: 3_000 })
    const { data: hidden } = await other.customer.from('bookkeeping_records').select('id').eq('id', initial.record.id)
    expect(hidden).toEqual([])
  })

  it('includes a kept receipt-only expense without a financial transaction', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'report-receipt', amounts: [-1_000] })
    const receiptId = crypto.randomUUID()
    const fingerprint = crypto.randomUUID().replaceAll('-', '').padEnd(64, 'a').slice(0, 64)
    await owner.customer.rpc('register_bookkeeping_receipt', { p_receipt_id: receiptId,
      p_upload_fingerprint: fingerprint, p_storage_path: `receipts/${owner.userId}/${fingerprint}`,
      p_original_name: 'receipt.pdf', p_mime_type: 'application/pdf', p_bytes: 42 })
    await owner.customer.rpc('record_bookkeeping_receipt_extraction', { p_receipt_id: receiptId,
      p_extraction_key: 'customer:v1', p_provider: 'customer', p_merchant: 'Receipt Vendor',
      p_occurred_on: '2026-07-03', p_total_amount_cents: 4_321, p_raw_payload: null })
    await owner.customer.rpc('keep_unmatched_bookkeeping_receipt', { p_receipt_id: receiptId })
    const { data: record } = await owner.customer.from('bookkeeping_records').select('id').eq('ingestion_key', `receipt:${receiptId}`).single()
    const { data: initial } = await owner.customer.from('bookkeeping_decisions').select('id').eq('bookkeeping_record_id', record!.id).single()
    const service = new CanonicalBookkeepingService(new SupabaseBookkeepingRepository(owner.customer))
    await service.recordDecision({ actor: { businessId: owner.businessId, userId: owner.userId,
      provenance: 'user' }, recordId: record!.id, expectedCurrentDecisionId: initial!.id,
      decision: { bookkeepingNature: 'expense', treatment: 'business', reviewStatus: 'resolved',
        reason: 'Customer business fact.', allocations: [{ kind: 'business', amountCents: -4_321 }] } })
    const report = await getAuthenticatedCanonicalReport({ supabase: owner.customer,
      periodStart: '2026-07-01', periodEnd: '2026-07-31' })
    expect(report.rows).toContainEqual(expect.objectContaining({ merchant: 'Receipt Vendor',
      sourceLabel: 'Receipt only', businessAmountCents: 4_321, hasEvidence: true }))
  })
})
