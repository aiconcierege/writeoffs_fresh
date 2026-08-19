import { describe, expect, it } from 'vitest'
import { currentTaxTreatment, validateTaxRuleAudit, validateTrustedTaxTreatment } from '../../app/lib/bookkeeping/tax-treatment-model'

describe('canonical tax-treatment domain', () => {
  it('requires a versioned supported rule for resolved treatment', () => {
    expect(() => validateTrustedTaxTreatment({ allocationAmountCents: -10_000,
      status: 'deductible', deductibleAmountCents: -10_000, taxCategoryKey: 'supplies',
      ruleKey: null, ruleVersion: null, reason: 'Supported purchase.' })).toThrow(/versioned rule/i)
  })

  it('accepts an exact or partial signed deduction but rejects sign and magnitude errors', () => {
    expect(() => validateTrustedTaxTreatment({ allocationAmountCents: -10_000,
      status: 'deductible', deductibleAmountCents: -7_000, taxCategoryKey: 'supplies',
      ruleKey: 'approved:example', ruleVersion: 1, reason: 'Supported test rule.' })).not.toThrow()
    for (const amount of [7_000, -10_001, 0]) expect(() => validateTrustedTaxTreatment({
      allocationAmountCents: -10_000, status: 'deductible', deductibleAmountCents: amount,
      taxCategoryKey: 'supplies', ruleKey: 'approved:example', ruleVersion: 1,
      reason: 'Supported test rule.' })).toThrow(/signed portion/i)
  })

  it('represents missing-fact and special-calculation states without a deduction', () => {
    for (const status of ['requires_facts', 'special_treatment'] as const) {
      expect(() => validateTrustedTaxTreatment({ allocationAmountCents: -10_000, status,
        deductibleAmountCents: null, taxCategoryKey: 'fixture-special', ruleKey: 'tax.fixture-special',
        ruleVersion: 1, reason: 'Fictional pending treatment.' })).not.toThrow()
    }
  })

  it('requires consistent downstream rule audit metadata without changing bookkeeping', () => {
    expect(() => validateTaxRuleAudit({ status: 'special_treatment', taxYear: 2026,
      outcomeType: 'special_treatment', adjustmentMethod: 'special_calculation',
      authorityReferences: [{ authority: 'internal_review', identifier: 'FICTIONAL-TEST-ONLY' }] })).not.toThrow()
    expect(() => validateTaxRuleAudit({ status: 'deductible', taxYear: 2026,
      outcomeType: 'nondeductible', adjustmentMethod: 'none',
      authorityReferences: [{ authority: 'internal_review', identifier: 'FICTIONAL-TEST-ONLY' }] }))
      .toThrow(/inconsistent/i)
  })

  it('uses one current append-only treatment leaf', () => {
    const prior = { id: 'prior', allocationId: 'allocation', supersedesTaxTreatmentId: null,
      status: 'unresolved' as const, deductibleAmountCents: null, taxCategoryKey: null,
      ruleKey: null, ruleVersion: null, reason: 'Pending.', provenance: 'system' as const,
      confidence: null }
    const current = { ...prior, id: 'current', supersedesTaxTreatmentId: 'prior',
      status: 'deductible' as const, deductibleAmountCents: -100, taxCategoryKey: 'supplies',
      ruleKey: 'approved:example', ruleVersion: 1 }
    expect(currentTaxTreatment([prior, current])?.id).toBe('current')
  })
})
