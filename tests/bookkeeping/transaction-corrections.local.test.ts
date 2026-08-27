import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { resolveFinancialTransactionRecord } from '../../app/lib/bookkeeping/financial-transaction-workflow'
import { CanonicalBookkeepingService } from '../../app/lib/bookkeeping/service'
import { SupabaseBookkeepingRepository } from '../../app/lib/bookkeeping/supabase-repository'
import { correctCanonicalTransactionUse } from '../../app/lib/bookkeeping/transaction-corrections'
import { getTransactionDetailReadModel } from '../../app/lib/bookkeeping/transaction-read-model'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const runLocal = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const client = (key: string) => createClient(url!, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function establishedExpense(label: string, amount: number) {
  const admin = client(serviceKey!)
  const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label, amounts: [amount] })
  const financialTransactionId = owner.transactionIds[0]
  const resolved = await resolveFinancialTransactionRecord({ supabase: owner.customer, financialTransactionId })
  const service = new CanonicalBookkeepingService(new SupabaseBookkeepingRepository(owner.customer))
  const decision = await service.recordDecision({ actor: { businessId: owner.businessId,
    userId: owner.userId, provenance: 'user' }, recordId: resolved.record.id,
    expectedCurrentDecisionId: resolved.decision.id,
    decision: { bookkeepingNature: 'expense', treatment: 'business', reviewStatus: 'resolved',
      businessPurpose: 'Established purpose', reason: 'Initial explicit customer fact.',
      allocations: [{ kind: 'business', amountCents: amount, taxCategoryKey: null }] } })
  return { ...owner, financialTransactionId, recordId: resolved.record.id, decision }
}

describe.skipIf(!runLocal)('canonical transaction corrections on local Supabase', () => {
  it('appends Personal and preserves immutable source and prior decision', async () => {
    const owner = await establishedExpense('correction-personal', -10_000)
    const requestId = crypto.randomUUID()
    const first = await correctCanonicalTransactionUse({ supabase: owner.customer,
      financialTransactionId: owner.financialTransactionId,
      expectedCurrentDecisionId: owner.decision.id, correctionRequestId: requestId,
      answer: { schemaVersion: 1, use: 'personal' } })
    const repeated = await correctCanonicalTransactionUse({ supabase: owner.customer,
      financialTransactionId: owner.financialTransactionId,
      expectedCurrentDecisionId: owner.decision.id, correctionRequestId: requestId,
      answer: { schemaVersion: 1, use: 'personal' } })
    expect(repeated).toMatchObject({
      decision_id: (first as Record<string, unknown>).decision_id, idempotent: true,
    })
    const { data: decisions } = await owner.customer.from('bookkeeping_decisions')
      .select('id,supersedes_decision_id,treatment,provenance,confidence,business_purpose')
      .eq('bookkeeping_record_id', owner.recordId).order('created_at')
    expect(decisions).toHaveLength(3)
    expect(decisions?.at(-1)).toMatchObject({ supersedes_decision_id: owner.decision.id,
      treatment: 'personal', provenance: 'user', confidence: null,
      business_purpose: 'Established purpose' })
    const { data: source } = await owner.customer.from('financial_transactions')
      .select('amount_cents,transaction_date').eq('id', owner.financialTransactionId).single()
    expect(source).toMatchObject({ amount_cents: -10_000, transaction_date: '2026-08-01' })
    const detail = await getTransactionDetailReadModel({ supabase: owner.customer,
      userId: owner.userId, transactionId: owner.financialTransactionId })
    expect(detail).toMatchObject({ treatmentLabel: 'Personal', correctionCount: 2,
      amountCents: -10_000, has_receipt: false })
  })

  it('derives exact signed mixed allocations from the personal amount', async () => {
    const owner = await establishedExpense('correction-mixed', -18_600)
    await correctCanonicalTransactionUse({ supabase: owner.customer,
      financialTransactionId: owner.financialTransactionId,
      expectedCurrentDecisionId: owner.decision.id, correctionRequestId: crypto.randomUUID(),
      answer: { schemaVersion: 1, use: 'mixed', personalAmountCents: 6_600 } })
    const { data: current } = await owner.customer.from('bookkeeping_decisions')
      .select('id,treatment').eq('bookkeeping_record_id', owner.recordId)
      .eq('treatment', 'mixed_use').single()
    const { data: allocations } = await owner.customer.from('bookkeeping_allocations')
      .select('allocation_kind,amount_cents').eq('bookkeeping_decision_id', current!.id)
      .order('allocation_kind')
    expect(allocations).toEqual([
      { allocation_kind: 'business', amount_cents: -12_000 },
      { allocation_kind: 'personal', amount_cents: -6_600 },
    ])
  })

  it('corrects a receipt-only expense without changing its immutable source record', async () => {
    const admin = client(serviceKey!)
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'correction-receipt-only', amounts: [-2_500] })
    const record = await admin.from('bookkeeping_records').insert({ business_id: owner.businessId,
      source_kind: 'receipt', ingestion_key: `receipt-correction:${crypto.randomUUID()}`,
      amount_cents: -8_417, currency: 'USD', occurred_on: '2026-08-12' }).select('id').single()
    expect(record.error).toBeNull()
    const service = new CanonicalBookkeepingService(new SupabaseBookkeepingRepository(owner.customer))
    const decision = await service.recordDecision({ actor: { businessId: owner.businessId,
      userId: owner.userId, provenance: 'user' }, recordId: record.data!.id,
      expectedCurrentDecisionId: null, decision: { bookkeepingNature: 'expense', treatment: 'business',
        reviewStatus: 'resolved', reason: 'Synthetic receipt-only established purchase.',
        allocations: [{ kind: 'business', amountCents: -8_417, taxCategoryKey: null }] } })
    await correctCanonicalTransactionUse({ supabase: owner.customer,
      financialTransactionId: record.data!.id, expectedCurrentDecisionId: decision.id,
      correctionRequestId: crypto.randomUUID(), answer: { schemaVersion: 1, use: 'personal' } })
    const [source,current] = await Promise.all([
      admin.from('bookkeeping_records').select('source_kind,amount_cents').eq('id',record.data!.id).single(),
      admin.from('bookkeeping_decisions').select('treatment,supersedes_decision_id')
        .eq('bookkeeping_record_id',record.data!.id).eq('treatment','personal').single(),
    ])
    expect(source.data).toEqual({ source_kind: 'receipt', amount_cents: -8_417 })
    expect(current.data).toMatchObject({ treatment: 'personal', supersedes_decision_id: decision.id })
  })

  it('rejects cross-Business, stale, over-total, and unresolved corrections', async () => {
    const owner = await establishedExpense('correction-owner', -5_000)
    const other = await provisionLocalCanonicalOwner({ admin: client(serviceKey!), url: url!,
      anonKey: anonKey!, label: 'correction-other', amounts: [-5_000] })
    await expect(correctCanonicalTransactionUse({ supabase: other.customer,
      financialTransactionId: owner.financialTransactionId,
      expectedCurrentDecisionId: owner.decision.id, correctionRequestId: crypto.randomUUID(),
      answer: { schemaVersion: 1, use: 'business' } })).rejects.toThrow(/not found/i)
    await expect(correctCanonicalTransactionUse({ supabase: owner.customer,
      financialTransactionId: owner.financialTransactionId,
      expectedCurrentDecisionId: crypto.randomUUID(), correctionRequestId: crypto.randomUUID(),
      answer: { schemaVersion: 1, use: 'business' } })).rejects.toThrow(/stale/i)
    await expect(correctCanonicalTransactionUse({ supabase: owner.customer,
      financialTransactionId: owner.financialTransactionId,
      expectedCurrentDecisionId: owner.decision.id, correctionRequestId: crypto.randomUUID(),
      answer: { schemaVersion: 1, use: 'mixed', personalAmountCents: 5_000 } })).rejects.toThrow(/between/i)
    const unresolved = await provisionLocalCanonicalOwner({ admin: client(serviceKey!), url: url!,
      anonKey: anonKey!, label: 'correction-unresolved', amounts: [-1_000] })
    const unresolvedState = await resolveFinancialTransactionRecord({ supabase: unresolved.customer,
      financialTransactionId: unresolved.transactionIds[0] })
    await expect(correctCanonicalTransactionUse({ supabase: unresolved.customer,
      financialTransactionId: unresolved.transactionIds[0], expectedCurrentDecisionId: unresolvedState.decision.id,
      correctionRequestId: crypto.randomUUID(), answer: { schemaVersion: 1, use: 'personal' } }))
      .resolves.toMatchObject({ bookkeeping_record_id: unresolvedState.record.id })
  })
})
