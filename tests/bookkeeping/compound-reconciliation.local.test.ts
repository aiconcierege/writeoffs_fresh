import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { SupabaseCanonicalFinancialSummaryRepository } from '../../app/lib/bookkeeping/financial-summary-repository'
import { listTransactionReadModel } from '../../app/lib/bookkeeping/transaction-read-model'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const suite = enabled ? describe.sequential : describe.skip

async function anchorFor(customer: SupabaseClient, transactionId: string) {
  const { data, error } = await customer.from('bookkeeping_financial_sources')
    .select('bookkeeping_record_id').eq('financial_transaction_id', transactionId)
    .is('revoked_at', null).single()
  expect(error).toBeNull()
  return String(data!.bookkeeping_record_id)
}

async function manualRecord(input: {
  customer: SupabaseClient
  businessId: string
  amountCents: number
  key: string
  resolvedIncome?: boolean
}) {
  const { data: record, error } = await input.customer.rpc('ensure_bookkeeping_record', {
    p_business_id: input.businessId,
    p_source_kind: 'manual',
    p_financial_transaction_id: null,
    p_provenance: 'user',
    p_ingestion_key: `compound-test:${input.key}`,
    p_amount_cents: input.amountCents,
    p_currency: 'USD',
    p_occurred_on: '2026-08-01',
  })
  expect(error).toBeNull()
  const recordId = String((record as Record<string, unknown>).id)
  const initial = await input.customer.rpc('ensure_initial_bookkeeping_decision', {
    p_business_id: input.businessId, p_bookkeeping_record_id: recordId,
  })
  expect(initial.error).toBeNull()
  if (input.resolvedIncome) {
    const resolved = await input.customer.rpc('append_bookkeeping_decision', {
      p_business_id: input.businessId,
      p_bookkeeping_record_id: recordId,
      p_expected_current_decision_id: initial.data,
      p_bookkeeping_nature: 'business_income',
      p_treatment: 'business',
      p_review_status: 'resolved',
      p_provenance: 'user',
      p_confidence: null,
      p_reason: 'Customer-confirmed payment used by compound reconciliation test.',
      p_business_purpose: null,
      p_allocations: [{ kind: 'business', amount_cents: input.amountCents }],
    })
    expect(resolved.error).toBeNull()
  }
  return recordId
}

suite('compound economic activity against local PostgreSQL', () => {
  it('activates an exact processor settlement once and replaces its anchor in current reads', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label: 'compound-settlement', amounts: [196_000],
    })
    const transactionId = owner.transactionIds[0]
    const anchorRecordId = await anchorFor(owner.customer, transactionId)
    const incomeId = await manualRecord({ customer: owner.customer, businessId: owner.businessId,
      amountCents: 200_000, key: crypto.randomUUID() })
    const feeId = await manualRecord({ customer: owner.customer, businessId: owner.businessId,
      amountCents: -4_000, key: crypto.randomUUID() })
    const requestKey = crypto.randomUUID()
    const payload = {
      p_business_id: owner.businessId,
      p_anchor_financial_transaction_id: transactionId,
      p_anchor_bookkeeping_record_id: anchorRecordId,
      p_scenario: 'processor_settlement',
      p_basis_kind: 'customer_fact',
      p_basis_reference_ids: [],
      p_components: [
        { recordId: incomeId, amountCents: 200_000, role: 'settlement_income' },
        { recordId: feeId, amountCents: -4_000, role: 'settlement_fee' },
      ],
      p_request_key: requestKey,
    }
    const [first, repeated] = await Promise.all([
      owner.customer.rpc('create_bookkeeping_compound_reconciliation', payload),
      owner.customer.rpc('create_bookkeeping_compound_reconciliation', payload),
    ])
    expect(first.error).toBeNull()
    expect(repeated.error).toBeNull()
    expect(first.data).toBe(repeated.data)
    const { data: active } = await owner.customer.from('current_bookkeeping_compound_components')
      .select('bookkeeping_record_id,linked_amount_cents,relationship_role')
      .eq('reconciliation_id', first.data)
    expect(active).toEqual(expect.arrayContaining([
      { bookkeeping_record_id: incomeId, linked_amount_cents: 200_000, relationship_role: 'settlement_income' },
      { bookkeeping_record_id: feeId, linked_amount_cents: -4_000, relationship_role: 'settlement_fee' },
    ]))
    const readRows = await listTransactionReadModel({
      supabase: owner.customer, userId: owner.userId, transactionId,
    })
    expect(readRows.map((row) => row.recordId).sort()).toEqual([feeId, incomeId].sort())
    const summary = await new SupabaseCanonicalFinancialSummaryRepository(owner.customer)
      .loadRecords({ businessId: owner.businessId, periodStart: '2026-01-01', periodEnd: '2026-12-31' })
    expect(summary.records.map((record) => record.id).sort()).toEqual([feeId, incomeId].sort())
    expect(summary.records.some((record) => record.id === anchorRecordId)).toBe(false)
    const { data: jobs } = await admin.from('bookkeeping_processing_jobs').select('bookkeeping_record_id')
      .eq('business_id', owner.businessId).like('target_fingerprint', '%:compound:%')
    expect(new Set(jobs?.map((job) => job.bookkeeping_record_id))).toEqual(new Set([incomeId, feeId]))
  })

  it('fails closed on bad cents/signs, enforces loan basis, and denies another tenant', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label: 'compound-loan', amounts: [-85_000],
    })
    const transactionId = owner.transactionIds[0]
    const anchorRecordId = await anchorFor(owner.customer, transactionId)
    const principalId = await manualRecord({ customer: owner.customer, businessId: owner.businessId,
      amountCents: -65_000, key: crypto.randomUUID() })
    const interestId = await manualRecord({ customer: owner.customer, businessId: owner.businessId,
      amountCents: -20_000, key: crypto.randomUUID() })
    const base = {
      p_business_id: owner.businessId,
      p_anchor_financial_transaction_id: transactionId,
      p_anchor_bookkeeping_record_id: anchorRecordId,
      p_scenario: 'loan_payment_split',
      p_basis_reference_ids: [],
      p_components: [
        { recordId: principalId, amountCents: -65_000, role: 'loan_principal' },
        { recordId: interestId, amountCents: -20_000, role: 'loan_interest' },
      ],
    }
    const unsupported = await owner.customer.rpc('create_bookkeeping_compound_reconciliation', {
      ...base, p_basis_kind: 'canonical_payment_evidence', p_request_key: crypto.randomUUID(),
    })
    expect(unsupported.error?.message).toContain('trusted evidence or customer facts')
    const wrongCents = await owner.customer.rpc('create_bookkeeping_compound_reconciliation', {
      ...base, p_basis_kind: 'customer_fact', p_request_key: crypto.randomUUID(),
      p_components: [
        { recordId: principalId, amountCents: -65_000, role: 'loan_principal' },
        { recordId: interestId, amountCents: -19_999, role: 'loan_interest' },
      ],
    })
    expect(wrongCents.error).not.toBeNull()
    const other = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label: 'compound-other', amounts: [],
    })
    const denied = await other.customer.rpc('create_bookkeeping_compound_reconciliation', {
      ...base, p_basis_kind: 'customer_fact', p_request_key: crypto.randomUUID(),
    })
    expect(denied.error).not.toBeNull()
    const valid = await owner.customer.rpc('create_bookkeeping_compound_reconciliation', {
      ...base, p_basis_kind: 'customer_fact', p_request_key: crypto.randomUUID(),
    })
    expect(valid.error).toBeNull()

    const protectedOwner = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label: 'compound-protected', amounts: [196_000],
    })
    const protectedAnchor = await anchorFor(protectedOwner.customer, protectedOwner.transactionIds[0])
    const { data: protectedDecision } = await protectedOwner.customer.from('bookkeeping_decisions')
      .select('id').eq('bookkeeping_record_id', protectedAnchor).single()
    const authored = await protectedOwner.customer.rpc('append_bookkeeping_decision', {
      p_business_id: protectedOwner.businessId, p_bookkeeping_record_id: protectedAnchor,
      p_expected_current_decision_id: protectedDecision!.id, p_bookkeeping_nature: 'business_income',
      p_treatment: 'business', p_review_status: 'resolved', p_provenance: 'user',
      p_confidence: null, p_reason: 'Customer-authored decision must be preserved.',
      p_business_purpose: null, p_allocations: [{ kind: 'business', amount_cents: 196_000 }],
    })
    expect(authored.error).toBeNull()
    const gross = await manualRecord({ customer: protectedOwner.customer,
      businessId: protectedOwner.businessId, amountCents: 200_000, key: crypto.randomUUID() })
    const fee = await manualRecord({ customer: protectedOwner.customer,
      businessId: protectedOwner.businessId, amountCents: -4_000, key: crypto.randomUUID() })
    const blocked = await protectedOwner.customer.rpc('create_bookkeeping_compound_reconciliation', {
      p_business_id: protectedOwner.businessId,
      p_anchor_financial_transaction_id: protectedOwner.transactionIds[0],
      p_anchor_bookkeeping_record_id: protectedAnchor, p_scenario: 'processor_settlement',
      p_basis_kind: 'customer_fact', p_basis_reference_ids: [], p_request_key: crypto.randomUUID(),
      p_components: [
        { recordId: gross, amountCents: 200_000, role: 'settlement_income' },
        { recordId: fee, amountCents: -4_000, role: 'settlement_fee' },
      ],
    })
    expect(blocked.error?.message).toContain('dependent or customer-authored')
  })

  it('supports batched deposits and safe later matching without double counting, then reverses', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label: 'compound-deposits', amounts: [30_000, 12_500],
    })
    const paymentA = await manualRecord({ customer: owner.customer, businessId: owner.businessId,
      amountCents: 10_000, key: crypto.randomUUID(), resolvedIncome: true })
    const paymentB = await manualRecord({ customer: owner.customer, businessId: owner.businessId,
      amountCents: 20_000, key: crypto.randomUUID(), resolvedIncome: true })
    const batchAnchor = await anchorFor(owner.customer, owner.transactionIds[0])
    const batch = await owner.customer.rpc('create_bookkeeping_compound_reconciliation', {
      p_business_id: owner.businessId,
      p_anchor_financial_transaction_id: owner.transactionIds[0],
      p_anchor_bookkeeping_record_id: batchAnchor,
      p_scenario: 'batched_deposit', p_basis_kind: 'canonical_payment_evidence',
      p_basis_reference_ids: [], p_request_key: crypto.randomUUID(),
      p_components: [
        { recordId: paymentA, amountCents: 10_000, role: 'deposit_payment' },
        { recordId: paymentB, amountCents: 20_000, role: 'deposit_payment' },
      ],
    })
    expect(batch.error).toBeNull()

    const laterPayment = await manualRecord({ customer: owner.customer, businessId: owner.businessId,
      amountCents: 12_500, key: crypto.randomUUID(), resolvedIncome: true })
    const laterAnchor = await anchorFor(owner.customer, owner.transactionIds[1])
    const later = await owner.customer.rpc('create_bookkeeping_compound_reconciliation', {
      p_business_id: owner.businessId,
      p_anchor_financial_transaction_id: owner.transactionIds[1],
      p_anchor_bookkeeping_record_id: laterAnchor,
      p_scenario: 'later_bank_match', p_basis_kind: 'canonical_payment_evidence',
      p_basis_reference_ids: [], p_request_key: crypto.randomUUID(),
      p_components: [{ recordId: laterPayment, amountCents: 12_500, role: 'payment_match' }],
    })
    expect(later.error).toBeNull()
    const financial = await new SupabaseCanonicalFinancialSummaryRepository(owner.customer)
      .loadRecords({ businessId: owner.businessId, periodStart: '2026-01-01', periodEnd: '2026-12-31' })
    const summary = (await import('../../app/lib/bookkeeping/financial-summary'))
      .aggregateCanonicalFinancialSummary({
        records: financial.records, periodStart: '2026-01-01', periodEnd: '2026-12-31',
        currency: 'USD', unresolvedCustomerQuestionCount: 0,
      })
    expect(summary.businessIncomeCents).toBe(42_500)
    expect(summary.contributors).toHaveLength(3)

    const { data: current } = await owner.customer.from('current_bookkeeping_compound_reconciliations')
      .select('reconciliation_id,reconciliation_event_id').eq('reconciliation_id', later.data).single()
    const reversalKey = crypto.randomUUID()
    const reversed = await owner.customer.rpc('reverse_bookkeeping_compound_reconciliation', {
      p_reconciliation_id: current!.reconciliation_id,
      p_expected_current_event_id: current!.reconciliation_event_id,
      p_request_key: reversalKey,
      p_reason: 'Controlled test correction.',
    })
    expect(reversed.error).toBeNull()
    const repeated = await owner.customer.rpc('reverse_bookkeeping_compound_reconciliation', {
      p_reconciliation_id: current!.reconciliation_id,
      p_expected_current_event_id: current!.reconciliation_event_id,
      p_request_key: reversalKey,
      p_reason: 'Controlled test correction.',
    })
    expect(repeated).toMatchObject({ data: reversed.data, error: null })
    const { data: after } = await owner.customer.from('current_bookkeeping_compound_reconciliations')
      .select('reconciliation_id').eq('reconciliation_id', later.data)
    expect(after).toEqual([])
  })
})
