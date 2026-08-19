import { describe, expect, it } from 'vitest'
import { PRODUCTION_TAX_RULE_CATALOG, validateTaxRuleCatalog } from '../../app/lib/bookkeeping/tax-rule-catalog'
import { evaluateFixtureTaxRules, evaluateProductionTaxRules } from '../../app/lib/bookkeeping/tax-rule-engine'
import { FICTIONAL_TAX_RULE_CATALOG } from '../fixtures/tax-rule-catalog'

const input = (category: string, extra: Record<string, unknown> = {}) => ({ profile: 'general' as const,
  taxYear: 2026, taxCategoryKey: category, businessAllocationAmountCents: -10_000,
  facts: { businessPurpose: 'Synthetic test fact' }, ...extra })

describe('versioned tax-rule engine', () => {
  it('keeps production empty and exposes no caller-selected production catalog', () => {
    expect(validateTaxRuleCatalog(PRODUCTION_TAX_RULE_CATALOG).rules).toEqual([])
    expect(evaluateProductionTaxRules(input('fixture-full')))
      .toMatchObject({ status: 'unresolved', reason: 'no_active_rule' })
    expect(evaluateProductionTaxRules).toHaveLength(1)
  })

  it('evaluates fictional full, limited, and nondeductible outcomes without changing allocation', () => {
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG, input('fixture-full')))
      .toMatchObject({ status: 'resolved', deductibleAmountCents: -10_000, outcomeType: 'full_deduction' })
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG, input('fixture-half')))
      .toMatchObject({ status: 'resolved', deductibleAmountCents: -5_000,
        outcomeType: 'fixed_fraction', adjustmentMethod: 'fixed_fraction' })
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG, input('fixture-none')))
      .toMatchObject({ status: 'resolved', deductibleAmountCents: 0, treatmentStatus: 'not_deductible' })
    expect(input('fixture-half').businessAllocationAmountCents).toBe(-10_000)
  })

  it('fails closed for missing facts, conflicts, retirement, and unsupported years', () => {
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG, input('fixture-ask')))
      .toMatchObject({ status: 'unresolved', reason: 'missing_evidence', missingFacts: ['assetIndicator'] })
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG, input('fixture-conflict')))
      .toMatchObject({ status: 'unresolved', reason: 'conflicting_rules' })
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG, input('fixture-potential')))
      .toMatchObject({ status: 'unresolved', reason: 'missing_evidence', missingFacts: ['assetIndicator'] })
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG,
      input('fixture-potential', { facts: { businessPurpose: 'Synthetic test fact', assetIndicator: false } })))
      .toMatchObject({ status: 'resolved', ruleKey: 'shared.fixture-potential-ready' })
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG, input('fixture-retired')))
      .toMatchObject({ status: 'unresolved', reason: 'no_active_rule' })
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG, input('fixture-approved')))
      .toMatchObject({ status: 'unresolved', reason: 'no_active_rule' })
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG,
      input('fixture-full', { taxYear: 2025 }))).toMatchObject({ status: 'unresolved', reason: 'unsupported_tax_year' })
  })

  it('pins the conclusion to the active tax-year rule version without reviving retired history', () => {
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG, input('fixture-versioned')))
      .toMatchObject({ status: 'resolved', ruleKey: 'shared.fixture-versioned', ruleVersion: 2, taxYear: 2026 })
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG,
      input('fixture-versioned', { taxYear: 2025 }))).toMatchObject({ status: 'unresolved', reason: 'unsupported_tax_year' })
  })

  it('routes fictional special calculations without claiming a transaction-level deduction', () => {
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG, input('fixture-special')))
      .toMatchObject({ status: 'special_treatment', treatmentKey: 'fictional_annual_calculation' })
  })

  it('rejects active production rules without approval and external authority metadata', () => {
    expect(() => validateTaxRuleCatalog({ kind: 'production', catalogVersion: 1,
      rules: [{ ...FICTIONAL_TAX_RULE_CATALOG.rules[0], authorityReferences: [] }] }))
      .toThrow(/approval or authority/i)
    expect(() => validateTaxRuleCatalog({ kind: 'production', catalogVersion: 1,
      rules: [FICTIONAL_TAX_RULE_CATALOG.rules[0]] })).toThrow(/external authority/i)
  })

  it('keeps General and Realtor namespaces scoped to their matching profiles', () => {
    expect(() => validateTaxRuleCatalog({ kind: 'test_fixture', catalogVersion: 1,
      rules: [{ ...FICTIONAL_TAX_RULE_CATALOG.rules[0], key: 'realtor.fixture', profiles: ['general'] }] }))
      .toThrow(/Realtor profile/i)
  })
})
