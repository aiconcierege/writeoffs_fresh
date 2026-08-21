import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { ingestCsvFinancialActivity, prepareCsvFinancialRows } from '../../app/lib/bookkeeping/csv-ingestion'
import { SupabaseCanonicalFinancialSummaryRepository } from '../../app/lib/bookkeeping/financial-summary-repository'
import { listTransactionReadModel } from '../../app/lib/bookkeeping/transaction-read-model'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const suite = enabled ? describe.sequential : describe.skip

async function keepReceipt(input: {
  customer: SupabaseClient
  merchant: string
  date: string
  amountCents: number
}) {
  const receiptId = crypto.randomUUID()
  const fingerprint = createHash('sha256').update(receiptId).digest('hex')
  const registered = await input.customer.rpc('register_bookkeeping_receipt', {
    p_receipt_id: receiptId,
    p_upload_fingerprint: fingerprint,
    p_storage_path: `receipts/${(await input.customer.auth.getUser()).data.user!.id}/${fingerprint}`,
    p_original_name: 'receipt.pdf',
    p_mime_type: 'application/pdf',
    p_bytes: 100,
  })
  expect(registered.error).toBeNull()
  const kept = await input.customer.rpc('keep_unmatched_bookkeeping_receipt_with_facts', {
    p_receipt_id: receiptId,
    p_merchant: input.merchant,
    p_occurred_on: input.date,
    p_total_amount_cents: input.amountCents,
  })
  expect(kept.error).toBeNull()
  return { receiptId, recordId: String((kept.data as Record<string, unknown>).record_id) }
}

async function importExactCsv(input: {
  customer: SupabaseClient
  merchant: string
  date: string
  amountCents: number
}) {
  const prepared = prepareCsvFinancialRows({
    mapping: { date: 'date', description: 'description', amount: 'amount' },
    rows: [{
      date: input.date,
      description: input.merchant,
      amount: (-input.amountCents / 100).toFixed(2),
    }],
  })
  expect(prepared.errors).toEqual([])
  await ingestCsvFinancialActivity({ supabase: input.customer, rows: prepared.rows })
}

suite('receipt-first financial convergence against local PostgreSQL', () => {
  it('converges one exact kept receipt, preserves both histories, and reverses safely', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label: 'receipt-convergence', amounts: [],
    })
    const receipt = await keepReceipt({
      customer: owner.customer, merchant: 'Exact Service Vendor', date: '2026-08-20', amountCents: 8743,
    })
    await importExactCsv({
      customer: owner.customer, merchant: 'Exact Service Vendor', date: '2026-08-20', amountCents: 8743,
    })

    const { data: physicalRecords } = await owner.customer.from('bookkeeping_records')
      .select('id,source_kind').eq('business_id', owner.businessId)
    expect(physicalRecords).toHaveLength(2)
    const financialRecord = physicalRecords!.find((row) => row.source_kind === 'financial_transaction')!
    const { data: active } = await owner.customer.from('current_bookkeeping_record_convergences')
      .select('*').eq('business_id', owner.businessId).single()
    expect(active).toMatchObject({
      survivor_record_id: financialRecord.id,
      absorbed_record_id: receipt.recordId,
      receipt_id: receipt.receiptId,
      matcher_key: 'receipt_financial_exact_v1',
    })

    const { data: decisions } = await owner.customer.from('bookkeeping_decisions')
      .select('bookkeeping_record_id,treatment,provenance').eq('business_id', owner.businessId)
    expect(decisions).toHaveLength(2)
    expect(decisions).toEqual(expect.arrayContaining([
      { bookkeeping_record_id: receipt.recordId, treatment: 'unresolved', provenance: 'system' },
      { bookkeeping_record_id: financialRecord.id, treatment: 'unresolved', provenance: 'system' },
    ]))
    const { data: keepLeaf } = await owner.customer.from('bookkeeping_receipt_events')
      .select('event_type,provenance,actor_user_id,bookkeeping_record_id')
      .eq('receipt_id', receipt.receiptId).eq('event_type', 'kept').single()
    expect(keepLeaf).toMatchObject({
      event_type: 'kept', provenance: 'user', actor_user_id: owner.userId,
      bookkeeping_record_id: receipt.recordId,
    })

    const transactionRows = await listTransactionReadModel({
      supabase: owner.customer, userId: owner.userId,
    })
    expect(transactionRows).toHaveLength(1)
    expect(transactionRows[0]).toMatchObject({
      recordId: financialRecord.id, has_receipt: true, treatment: 'unresolved',
    })
    const summary = await new SupabaseCanonicalFinancialSummaryRepository(owner.customer)
      .loadRecords({ businessId: owner.businessId, periodStart: '2026-01-01', periodEnd: '2026-12-31' })
    expect(summary.records).toHaveLength(1)
    expect(summary.records[0].id).toBe(financialRecord.id)
    const { data: survivorJobs } = await admin.from('bookkeeping_processing_jobs')
      .select('target_fingerprint').eq('business_id', owner.businessId)
      .eq('bookkeeping_record_id', financialRecord.id).like('target_fingerprint', '%:convergence:%')
    expect(survivorJobs).toHaveLength(1)

    const other = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label: 'receipt-convergence-other', amounts: [],
    })
    const denied = await other.customer.rpc('reverse_bookkeeping_record_convergence', {
      p_convergence_id: active!.convergence_id,
      p_expected_current_event_id: active!.convergence_event_id,
      p_request_key: crypto.randomUUID(),
      p_reason: 'Wrong tenant must not reverse this event.',
    })
    expect(denied.error).not.toBeNull()

    const reversalKey = crypto.randomUUID()
    const reversed = await owner.customer.rpc('reverse_bookkeeping_record_convergence', {
      p_convergence_id: active!.convergence_id,
      p_expected_current_event_id: active!.convergence_event_id,
      p_request_key: reversalKey,
      p_reason: 'Controlled local test reversal.',
    })
    expect(reversed.error).toBeNull()
    const repeated = await owner.customer.rpc('reverse_bookkeeping_record_convergence', {
      p_convergence_id: active!.convergence_id,
      p_expected_current_event_id: active!.convergence_event_id,
      p_request_key: reversalKey,
      p_reason: 'Controlled local test reversal.',
    })
    expect(repeated).toMatchObject({ data: reversed.data, error: null })
    const { data: afterReversal } = await owner.customer
      .from('current_bookkeeping_record_convergences').select('*').eq('business_id', owner.businessId)
    expect(afterReversal).toEqual([])
    expect(await listTransactionReadModel({
      supabase: owner.customer, userId: owner.userId,
    })).toHaveLength(2)

    const reconverged = await admin.rpc('attempt_bookkeeping_receipt_convergence', {
      p_business_id: owner.businessId, p_financial_record_id: financialRecord.id,
    })
    expect(reconverged.error).toBeNull()
    expect(reconverged.data).not.toBe(active!.convergence_event_id)
    const { data: history } = await owner.customer.from('bookkeeping_record_convergence_events')
      .select('event_type').eq('business_id', owner.businessId)
    expect(history?.map((row) => row.event_type).sort()).toEqual(['converged', 'converged', 'reversed'])
  })

  it('fails closed for mismatches and ambiguous candidates', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label: 'receipt-convergence-closed', amounts: [],
    })
    await keepReceipt({ customer: owner.customer, merchant: 'Mismatch Merchant', date: '2026-08-20', amountCents: 1000 })
    await importExactCsv({ customer: owner.customer, merchant: 'Other Merchant', date: '2026-08-20', amountCents: 1000 })
    await keepReceipt({ customer: owner.customer, merchant: 'Duplicate Merchant', date: '2026-08-19', amountCents: 2000 })
    await keepReceipt({ customer: owner.customer, merchant: 'Duplicate Merchant', date: '2026-08-19', amountCents: 2000 })
    await importExactCsv({ customer: owner.customer, merchant: 'Duplicate Merchant', date: '2026-08-19', amountCents: 2000 })
    const { data: active, error } = await owner.customer.from('current_bookkeeping_record_convergences')
      .select('convergence_id').eq('business_id', owner.businessId)
    expect(error).toBeNull()
    expect(active).toEqual([])
  })
})
