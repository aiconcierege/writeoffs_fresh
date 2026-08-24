import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { aggregateCanonicalFinancialSummary } from '../../app/lib/bookkeeping/financial-summary'
import { SupabaseCanonicalFinancialSummaryRepository } from '../../app/lib/bookkeeping/financial-summary-repository'
import { listTransactionReadModel } from '../../app/lib/bookkeeping/transaction-read-model'
import { invoiceDetail } from '../../app/lib/invoices/repository'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const suite = enabled ? describe.sequential : describe.skip

type Owner = Awaited<ReturnType<typeof provisionLocalCanonicalOwner>>

async function createInvoice(owner: Owner, input: { amount?: number; key?: string; customer?: string } = {}) {
  const response = await owner.customer.rpc('create_canonical_invoice', {
    p_customer_name: input.customer ?? 'John Smith', p_customer_email: 'john@example.test',
    p_amount_cents: input.amount ?? 200_000, p_currency: 'USD', p_issue_date: '2026-08-01',
    p_due_date: '2026-08-15', p_description: 'Smith backyard cleanup',
    p_job_label: 'Smith backyard', p_location: '1842 W Elm St', p_note: 'Thank you.',
    p_request_key: input.key ?? crypto.randomUUID(),
  })
  expect(response.error).toBeNull()
  return String(response.data)
}

async function currentInvoice(owner: Owner, id: string) {
  const { data, error } = await owner.customer.from('current_canonical_invoices')
    .select('*').eq('id', id).single()
  expect(error).toBeNull()
  return data!
}

async function recordIncome(owner: Owner, amountCents = 200_000) {
  const result = await owner.customer.rpc('record_manual_financial_activity', {
    p_direction: 'received', p_amount_cents: amountCents, p_currency: 'USD',
    p_occurred_on: '2026-08-01', p_payment_method: 'check', p_counterparty_name: 'John Smith',
    p_description: 'Smith backyard cleanup', p_job_label: 'Smith backyard', p_location: null,
    p_note: null, p_request_key: crypto.randomUUID(),
  })
  expect(result.error).toBeNull()
  const { data, error } = await owner.customer.from('current_manual_financial_activity')
    .select('id,bookkeeping_record_id').eq('manual_financial_source_id', result.data).single()
  expect(error).toBeNull()
  return data!
}

async function resolveImportedIncome(owner: Owner, transactionId: string) {
  const { data: source } = await owner.customer.from('bookkeeping_financial_sources')
    .select('bookkeeping_record_id').eq('financial_transaction_id', transactionId).single()
  const recordId = String(source!.bookkeeping_record_id)
  const { data: decision } = await owner.customer.from('bookkeeping_decisions')
    .select('id').eq('bookkeeping_record_id', recordId).single()
  const result = await owner.customer.rpc('append_bookkeeping_decision', {
    p_business_id: owner.businessId, p_bookkeeping_record_id: recordId,
    p_expected_current_decision_id: decision!.id, p_bookkeeping_nature: 'business_income',
    p_treatment: 'business', p_review_status: 'resolved', p_provenance: 'user',
    p_confidence: null, p_reason: 'Customer confirmed this was business income.',
    p_business_purpose: null, p_allocations: [{ kind: 'business', amount_cents: 200_000 }],
  })
  expect(result.error).toBeNull()
  return recordId
}

async function link(owner: Owner, invoiceId: string, recordId: string, key = crypto.randomUUID()) {
  const invoice = await currentInvoice(owner, invoiceId)
  return owner.customer.rpc('link_invoice_to_business_income', {
    p_invoice_id: invoiceId, p_expected_current_event_id: invoice.current_event_id,
    p_bookkeeping_record_id: recordId, p_request_key: key,
  })
}

suite('canonical invoice workflow against local PostgreSQL', () => {
  it('creates numbered invoices idempotently with no cash-basis income', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'invoice-create', amounts: [] })
    const key = crypto.randomUUID()
    const first = await createInvoice(owner, { key })
    const repeated = await createInvoice(owner, { key })
    expect(repeated).toBe(first)
    const second = await createInvoice(owner, { customer: 'Acme' })
    expect((await currentInvoice(owner, first)).invoice_number).toBe('INV-0001')
    expect((await currentInvoice(owner, second)).invoice_number).toBe('INV-0002')
    const loaded = await new SupabaseCanonicalFinancialSummaryRepository(owner.customer)
      .loadRecords({ businessId: owner.businessId, periodStart: '2026-01-01', periodEnd: '2026-12-31' })
    const summary = aggregateCanonicalFinancialSummary({ records: loaded.records,
      periodStart: '2026-01-01', periodEnd: '2026-12-31', currency: 'USD',
      unresolvedCustomerQuestionCount: 0 })
    expect(summary.businessIncomeCents).toBe(0)
    const { count } = await owner.customer.from('bookkeeping_records').select('*', { count: 'exact', head: true })
    expect(count).toBe(0)
  })

  it('corrects and cancels append-only, rejects stale and cross-tenant access', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'invoice-correct', amounts: [] })
    const other = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'invoice-other', amounts: [] })
    const id = await createInvoice(owner)
    const initial = await currentInvoice(owner, id)
    const corrected = await owner.customer.rpc('correct_canonical_invoice', {
      p_invoice_id: id, p_expected_current_event_id: initial.current_event_id,
      p_customer_name: 'John Smith', p_customer_email: 'john@example.test', p_amount_cents: 200_000,
      p_currency: 'USD', p_issue_date: '2026-08-01', p_due_date: null,
      p_description: 'Corrected backyard cleanup', p_job_label: 'Smith backyard',
      p_location: null, p_note: null, p_request_key: crypto.randomUUID(),
    })
    expect(corrected.error).toBeNull()
    const stale = await owner.customer.rpc('cancel_canonical_invoice', {
      p_invoice_id: id, p_expected_current_event_id: initial.current_event_id,
      p_request_key: crypto.randomUUID(), p_reason: 'Stale request.',
    })
    expect(stale.error).toBeTruthy()
    const denied = await other.customer.from('canonical_invoice_events').select('id').eq('invoice_id', id)
    expect(denied.data).toEqual([])
    const current = await currentInvoice(owner, id)
    const canceled = await owner.customer.rpc('cancel_canonical_invoice', {
      p_invoice_id: id, p_expected_current_event_id: current.current_event_id,
      p_request_key: crypto.randomUUID(), p_reason: 'Work was canceled.',
    })
    expect(canceled.error).toBeNull()
    expect((await currentInvoice(owner, id)).status).toBe('canceled')
    const { data: history } = await owner.customer.from('canonical_invoice_events')
      .select('event_type').eq('invoice_id', id).order('created_at')
    expect(history?.map((row) => row.event_type)).toEqual(expect.arrayContaining(['created', 'corrected', 'canceled']))
    expect(history).toHaveLength(3)
  })

  it('links exact manual income once and preserves it through later bank convergence', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'invoice-manual', amounts: [200_000] })
    const id = await createInvoice(owner)
    const manual = await recordIncome(owner)
    const linked = await link(owner, id, manual.bookkeeping_record_id)
    expect(linked.error).toBeNull()
    expect((await currentInvoice(owner, id)).status).toBe('paid')
    const unsafeCorrection = await owner.customer.rpc('correct_canonical_invoice', {
      p_invoice_id: id, p_expected_current_event_id: (await currentInvoice(owner, id)).current_event_id,
      p_customer_name: 'John Smith', p_customer_email: null, p_amount_cents: 199_999,
      p_currency: 'USD', p_issue_date: '2026-08-01', p_due_date: null,
      p_description: 'Changed after payment', p_job_label: null, p_location: null,
      p_note: null, p_request_key: crypto.randomUUID(),
    })
    expect(unsafeCorrection.error).toBeTruthy()
    const match = await owner.customer.rpc('match_manual_financial_activity_to_bank_transaction', {
      p_manual_financial_source_id: (await owner.customer.from('current_manual_financial_activity')
        .select('manual_financial_source_id').eq('bookkeeping_record_id', manual.bookkeeping_record_id).single()).data!.manual_financial_source_id,
      p_expected_current_event_id: manual.id, p_financial_transaction_id: owner.transactionIds[0],
      p_request_key: crypto.randomUUID(),
    })
    expect(match.error).toBeNull()
    const loaded = await new SupabaseCanonicalFinancialSummaryRepository(owner.customer)
      .loadRecords({ businessId: owner.businessId, periodStart: '2026-01-01', periodEnd: '2026-12-31' })
    const summary = aggregateCanonicalFinancialSummary({ records: loaded.records,
      periodStart: '2026-01-01', periodEnd: '2026-12-31', currency: 'USD',
      unresolvedCustomerQuestionCount: 0 })
    expect(summary.businessIncomeCents).toBe(200_000)
    expect(summary.contributors).toHaveLength(1)
    const rows = await listTransactionReadModel({ supabase: owner.customer, userId: owner.userId })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ vendor: 'John Smith', description: 'Smith backyard cleanup' })
    expect(rows[0].sourceLabel).toContain('Invoice INV-0001')
  })

  it('links imported business income and rejects reuse or ambiguous automatic recognition', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'invoice-imported', amounts: [200_000] })
    const recordId = await resolveImportedIncome(owner, owner.transactionIds[0])
    const first = await createInvoice(owner)
    expect((await link(owner, first, recordId)).error).toBeNull()
    const second = await createInvoice(owner, { customer: 'Second customer' })
    expect((await link(owner, second, recordId)).error).toBeTruthy()
    expect((await invoiceDetail(owner.customer, second)).paymentCandidates).toEqual([])

    const ambiguous = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'invoice-ambiguous', amounts: [] })
    await recordIncome(ambiguous)
    await recordIncome(ambiguous)
    const ambiguousInvoice = await createInvoice(ambiguous)
    expect((await invoiceDetail(ambiguous.customer, ambiguousInvoice)).paymentCandidates).toHaveLength(2)
    expect((await currentInvoice(ambiguous, ambiguousInvoice)).status).toBe('awaiting_payment')
  })
})
