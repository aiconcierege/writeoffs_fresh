import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'
import { resolveFinancialTransactionRecord } from '../../app/lib/bookkeeping/financial-transaction-workflow'
import { CanonicalBookkeepingService } from '../../app/lib/bookkeeping/service'
import { SupabaseBookkeepingRepository } from '../../app/lib/bookkeeping/supabase-repository'
import { appendTrustedTaxTreatment, evaluateAndAppendProductionTaxTreatment } from '../../app/lib/bookkeeping/tax-treatment-service'
import { getAuthenticatedCanonicalReport } from '../../app/lib/bookkeeping/reporting-service'
import { correctCanonicalTransactionUse } from '../../app/lib/bookkeeping/transaction-corrections'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const suite = enabled ? describe : describe.skip

suite('canonical tax treatment against local PostgreSQL', () => {
  it('persists a 2025 active-rule conclusion idempotently and fails closed for unsupported years', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'tier-a-owner', amounts: [-10_000], occurredYear: 2025 })
    const initial = await resolveFinancialTransactionRecord({ supabase: owner.customer,
      financialTransactionId: owner.transactionIds[0] })
    const bookkeeping = new CanonicalBookkeepingService(new SupabaseBookkeepingRepository(owner.customer))
    const decision = await bookkeeping.recordDecision({ actor: { businessId: owner.businessId,
      userId: owner.userId, provenance: 'user' }, recordId: initial.record.id,
      expectedCurrentDecisionId: initial.decision.id, decision: { bookkeepingNature: 'expense',
        treatment: 'mixed_use', reviewStatus: 'resolved', reason: 'Explicit mixed business use.',
        allocations: [{ kind: 'business', amountCents: -7_000, taxCategoryKey: 'advertising' },
          { kind: 'personal', amountCents: -3_000 }] } })
    const { data: allocation } = await owner.customer.from('bookkeeping_allocations')
      .select('id').eq('bookkeeping_decision_id', decision.id).eq('allocation_kind', 'business').single()
    const facts = { transactionNature: 'expense', businessPurpose: 'Promote the existing business.',
      businessUseTreatment: 'mixed', expenseNature: 'advertising', conflictingEvidence: false,
      capitalizableAsset: false }
    const [first, retry] = await Promise.all([0, 1].map(() => evaluateAndAppendProductionTaxTreatment({
      supabase: admin, businessId: owner.businessId, allocationId: allocation!.id,
      expectedCurrentTaxTreatmentId: null, facts, evaluationRequestId: 'same-evaluation' })))
    expect(first).toMatchObject({ status: 'resolved', ruleKey: 'tax.advertising',
      deductibleAmountCents: -7_000 })
    expect(retry).toMatchObject({ status: 'resolved', treatmentId: first.status === 'resolved'
      ? first.treatmentId : undefined })
    const { data: rows } = await admin.from('bookkeeping_tax_treatments')
      .select('rule_key,rule_version,tax_year,deductible_amount_cents,authority_references')
      .eq('bookkeeping_allocation_id', allocation!.id)
    expect(rows).toHaveLength(1)
    expect(rows![0]).toMatchObject({ rule_key: 'tax.advertising', rule_version: 1,
      tax_year: 2025, deductible_amount_cents: -7_000 })
    expect(rows![0].authority_references).toHaveLength(2)
    const report = await getAuthenticatedCanonicalReport({ supabase: owner.customer,
      periodStart: '2025-01-01', periodEnd: '2025-12-31' })
    expect(report).toMatchObject({ businessExpensesCents: 7_000, businessProfitCents: -7_000,
      estimatedDeductionsCents: 7_000, estimatedTaxableIncomeCents: null })

    const unsupported = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'tier-a-unsupported-year', amounts: [-1_000], occurredYear: 2027 })
    const unsupportedState = await resolveFinancialTransactionRecord({ supabase: unsupported.customer,
      financialTransactionId: unsupported.transactionIds[0] })
    const unsupportedService = new CanonicalBookkeepingService(new SupabaseBookkeepingRepository(unsupported.customer))
    const unsupportedDecision = await unsupportedService.recordDecision({ actor: { businessId: unsupported.businessId,
      userId: unsupported.userId, provenance: 'user' }, recordId: unsupportedState.record.id,
      expectedCurrentDecisionId: unsupportedState.decision.id, decision: { bookkeepingNature: 'expense',
        treatment: 'business', reviewStatus: 'resolved', reason: 'Business.',
        allocations: [{ kind: 'business', amountCents: -1_000, taxCategoryKey: 'advertising' }] } })
    const { data: unsupportedAllocation } = await unsupported.customer.from('bookkeeping_allocations')
      .select('id').eq('bookkeeping_decision_id', unsupportedDecision.id).single()
    expect(await evaluateAndAppendProductionTaxTreatment({ supabase: admin,
      businessId: unsupported.businessId, allocationId: unsupportedAllocation!.id,
      expectedCurrentTaxTreatmentId: null, facts: { ...facts, businessUseTreatment: 'business' },
      evaluationRequestId: 'unsupported-year' }))
      .toMatchObject({ status: 'unresolved', reason: 'unsupported_tax_year' })
  })

  it('records trusted treatment, rejects customer writes, and follows current corrections', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    await admin.from('categories').upsert({ key: 'supported-test', label: 'Supported test category' })
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'tax-owner', amounts: [-10_000] })
    const initial = await resolveFinancialTransactionRecord({ supabase: owner.customer,
      financialTransactionId: owner.transactionIds[0] })
    const bookkeeping = new CanonicalBookkeepingService(new SupabaseBookkeepingRepository(owner.customer))
    const decision = await bookkeeping.recordDecision({ actor: { businessId: owner.businessId,
      userId: owner.userId, provenance: 'user' }, recordId: initial.record.id,
      expectedCurrentDecisionId: initial.decision.id, decision: { bookkeepingNature: 'expense',
        treatment: 'business', reviewStatus: 'resolved', reason: 'Explicit business fact.',
        allocations: [{ kind: 'business', amountCents: -10_000, taxCategoryKey: 'supported-test' }] } })
    const { data: allocation } = await owner.customer.from('bookkeeping_allocations')
      .select('id').eq('bookkeeping_decision_id', decision.id).single()
    const { error: customerWrite } = await owner.customer.from('bookkeeping_tax_treatments').insert({
      business_id: owner.businessId, bookkeeping_record_id: initial.record.id,
      bookkeeping_decision_id: decision.id, bookkeeping_allocation_id: allocation!.id,
      treatment_status: 'deductible', deductible_amount_cents: -10_000,
      tax_category_key: 'supported-test', rule_key: 'forbidden', rule_version: 1,
      reason: 'Customer cannot make this conclusion.', provenance: 'system',
    })
    expect(customerWrite).toBeTruthy()
    const taxInput: Parameters<typeof appendTrustedTaxTreatment>[0] = { supabase: admin, businessId: owner.businessId,
      allocationId: allocation!.id, expectedCurrentTaxTreatmentId: null,
      conclusionKey: 'supported-test:v1',
      status: 'deductible', deductibleAmountCents: -8_000, taxCategoryKey: 'supported-test',
      ruleKey: 'approved:test-only', ruleVersion: 1, reason: 'Versioned test rule.', provenance: 'system',
      taxYear: 2026, outcomeType: 'fixed_fraction', adjustmentMethod: 'fixed_fraction',
      factualBasis: { businessPurpose: 'Fictional test fact' },
      authorityReferences: [{ authority: 'internal_review', identifier: 'FICTIONAL-TEST-ONLY' }] }
    const [first, repeated] = await Promise.all([
      appendTrustedTaxTreatment(taxInput), appendTrustedTaxTreatment(taxInput),
    ])
    expect(first.id).toBe(repeated.id)
    await expect(appendTrustedTaxTreatment({ ...taxInput, reason: 'Different conclusion.' }))
      .rejects.toThrow(/reused with different content/i)
    let report = await getAuthenticatedCanonicalReport({ supabase: owner.customer,
      periodStart: '2026-01-01', periodEnd: '2026-12-31' })
    expect(report.estimatedDeductionsCents).toBe(8_000)
    expect(report.businessExpensesCents).toBe(10_000)
    expect(report.businessProfitCents).toBe(-10_000)
    const { data: factRevision, error: factError } = await owner.customer.rpc('record_business_fact_changes', {
      p_business_id: owner.businessId, p_changes: { uses_customer_job_materials: 'no' },
      p_expected_event_ids: {}, p_source: 'onboarding', p_reason: 'Initial Business fact.',
      p_request_key: crypto.randomUUID(),
    })
    expect(factError).toBeNull()
    const { error: dependencyError } = await admin
      .from('bookkeeping_tax_treatment_business_fact_dependencies').insert({
        business_id: owner.businessId, tax_treatment_id: first.id,
        fact_key: 'uses_customer_job_materials',
        based_on_business_fact_event_id: factRevision.uses_customer_job_materials,
      })
    expect(dependencyError).toBeNull()
    const { error: correctionError } = await owner.customer.rpc('record_business_fact_changes', {
      p_business_id: owner.businessId, p_changes: { uses_customer_job_materials: 'yes' },
      p_expected_event_ids: { uses_customer_job_materials: factRevision.uses_customer_job_materials },
      p_source: 'settings', p_reason: 'Corrected Business fact.', p_request_key: crypto.randomUUID(),
    })
    expect(correctionError).toBeNull()
    report = await getAuthenticatedCanonicalReport({ supabase: owner.customer,
      periodStart: '2026-01-01', periodEnd: '2026-12-31' })
    expect(report.estimatedDeductionsCents).toBeNull()
    expect(report.businessExpensesCents).toBe(10_000)
    expect(report.businessProfitCents).toBe(-10_000)
    await correctCanonicalTransactionUse({ supabase: owner.customer,
      financialTransactionId: owner.transactionIds[0], expectedCurrentDecisionId: decision.id,
      correctionRequestId: crypto.randomUUID(), answer: { schemaVersion: 1, use: 'mixed', personalAmountCents: 3_000 } })
    report = await getAuthenticatedCanonicalReport({ supabase: owner.customer,
      periodStart: '2026-01-01', periodEnd: '2026-12-31' })
    expect(report.businessExpensesCents).toBe(7_000)
    expect(report.estimatedDeductionsCents).toBeNull()
  })

  it('records special treatment without changing bookkeeping expense or claiming a deduction', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    await admin.from('categories').upsert({ key: 'special-test', label: 'Special test category' })
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'tax-special-owner', amounts: [-10_000] })
    const initial = await resolveFinancialTransactionRecord({ supabase: owner.customer,
      financialTransactionId: owner.transactionIds[0] })
    const bookkeeping = new CanonicalBookkeepingService(new SupabaseBookkeepingRepository(owner.customer))
    const decision = await bookkeeping.recordDecision({ actor: { businessId: owner.businessId,
      userId: owner.userId, provenance: 'user' }, recordId: initial.record.id,
      expectedCurrentDecisionId: initial.decision.id, decision: { bookkeepingNature: 'expense',
        treatment: 'business', reviewStatus: 'resolved', reason: 'Explicit business fact.',
        allocations: [{ kind: 'business', amountCents: -10_000, taxCategoryKey: 'special-test' }] } })
    const { data: allocation } = await owner.customer.from('bookkeeping_allocations')
      .select('id').eq('bookkeeping_decision_id', decision.id).single()
    await appendTrustedTaxTreatment({ supabase: admin, businessId: owner.businessId,
      allocationId: allocation!.id, expectedCurrentTaxTreatmentId: null,
      conclusionKey: 'special-test:v1', status: 'special_treatment', deductibleAmountCents: null,
      taxCategoryKey: 'special-test', ruleKey: 'tax.fixture-special', ruleVersion: 1,
      reason: 'Fictional annual calculation required.', provenance: 'system', taxYear: 2026,
      outcomeType: 'special_treatment', adjustmentMethod: 'special_calculation',
      factualBasis: { assetIndicator: true },
      authorityReferences: [{ authority: 'internal_review', identifier: 'FICTIONAL-TEST-ONLY' }] })
    const report = await getAuthenticatedCanonicalReport({ supabase: owner.customer,
      periodStart: '2026-01-01', periodEnd: '2026-12-31' })
    expect(report).toMatchObject({ businessExpensesCents: 10_000, businessProfitCents: -10_000,
      estimatedDeductionsCents: null })
  })

  it('enforces same-Business references, RLS, append-only history, and signed limits', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    await admin.from('categories').upsert({ key: 'supported-test', label: 'Supported test category' })
    const a = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label: 'tax-a', amounts: [-100] })
    const b = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label: 'tax-b', amounts: [-100] })
    const state = await resolveFinancialTransactionRecord({ supabase: a.customer, financialTransactionId: a.transactionIds[0] })
    const service = new CanonicalBookkeepingService(new SupabaseBookkeepingRepository(a.customer))
    const decision = await service.recordDecision({ actor: { businessId: a.businessId, userId: a.userId, provenance: 'user' },
      recordId: state.record.id, expectedCurrentDecisionId: state.decision.id,
      decision: { bookkeepingNature: 'expense', treatment: 'business', reviewStatus: 'resolved',
        reason: 'Business.', allocations: [{ kind: 'business', amountCents: -100, taxCategoryKey: 'supported-test' }] } })
    const { data: allocation } = await a.customer.from('bookkeeping_allocations').select('id').eq('bookkeeping_decision_id', decision.id).single()
    await expect(appendTrustedTaxTreatment({ supabase: admin, businessId: b.businessId,
      allocationId: allocation!.id, expectedCurrentTaxTreatmentId: null, status: 'deductible',
      conclusionKey: 'wrong-business:v1',
      deductibleAmountCents: -100, taxCategoryKey: 'supported-test', ruleKey: 'approved:test-only',
      ruleVersion: 1, reason: 'Wrong Business.', provenance: 'system' })).rejects.toThrow(/not found/i)
    await expect(appendTrustedTaxTreatment({ supabase: admin, businessId: a.businessId,
      allocationId: allocation!.id, expectedCurrentTaxTreatmentId: null, status: 'deductible',
      conclusionKey: 'too-much:v1',
      deductibleAmountCents: -101, taxCategoryKey: 'supported-test', ruleKey: 'approved:test-only',
      ruleVersion: 1, reason: 'Too much.', provenance: 'system' })).rejects.toThrow(/signed portion/i)
    const inserted = await appendTrustedTaxTreatment({ supabase: admin, businessId: a.businessId,
      allocationId: allocation!.id, expectedCurrentTaxTreatmentId: null, status: 'unresolved',
      conclusionKey: 'unresolved:v1',
      deductibleAmountCents: null, taxCategoryKey: null, ruleKey: null, ruleVersion: null,
      reason: 'No approved rule.', provenance: 'system' })
    const { error: updateError } = await admin.from('bookkeeping_tax_treatments')
      .update({ reason: 'Changed' }).eq('id', inserted.id)
    expect(updateError?.message).toMatch(/permission denied|append-only/i)
    expect((await b.customer.from('bookkeeping_tax_treatments').select('id').eq('id', inserted.id)).data).toEqual([])
  })
})
