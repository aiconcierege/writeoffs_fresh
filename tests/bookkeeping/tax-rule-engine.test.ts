import { describe, expect, it } from 'vitest'
import { PRODUCTION_TAX_RULE_CATALOG, validateTaxRuleCatalog } from '../../app/lib/bookkeeping/tax-rule-catalog'
import { evaluateFixtureTaxRules, evaluateProductionTaxRules } from '../../app/lib/bookkeeping/tax-rule-engine'
import { FICTIONAL_TAX_RULE_CATALOG } from '../fixtures/tax-rule-catalog'

const input = (category: string, extra: Record<string, unknown> = {}) => ({
  taxYear: 2026, taxCategoryKey: category, businessAllocationAmountCents: -10_000,
  facts: { businessPurpose: 'Synthetic test fact' }, ...extra })

describe('versioned tax-rule engine', () => {
  it('exposes exactly the seven approved 2025 rules and no caller-selected production catalog', () => {
    const rules = validateTaxRuleCatalog(PRODUCTION_TAX_RULE_CATALOG).rules
    expect(rules).toHaveLength(7)
    expect(rules.map((rule) => rule.key)).toEqual([
      'tax.advertising', 'tax.office-expense', 'tax.supplies', 'tax.postage-shipping',
      'tax.software-cloud', 'tax.payment-bank-fees', 'tax.business-license',
    ])
    expect(rules.every((rule) => rule.lifecycle === 'active'
      && rule.taxYears.from === 2025 && rule.taxYears.through === 2025)).toBe(true)
    expect(evaluateProductionTaxRules(input('fixture-full')))
      .toMatchObject({ status: 'unresolved', reason: 'no_active_rule' })
    expect(evaluateProductionTaxRules).toHaveLength(1)
  })

  const productionCases = [
    { category: 'advertising', key: 'tax.advertising', facts: { expenseNature: 'advertising', capitalizableAsset: false } },
    { category: 'office-expense', key: 'tax.office-expense', facts: {
      expenseNature: 'office_expense', durableProperty: false, inventoryOrResale: false } },
    { category: 'supplies', key: 'tax.supplies', facts: {
      expenseNature: 'consumable_supplies', supplyUseContext: 'operating_supply',
      durableProperty: false, inventoryOrResale: false } },
    { category: 'postage-shipping', key: 'tax.postage-shipping', facts: {
      expenseNature: 'postage_shipping', shippingCostContext: 'standalone_business_delivery' } },
    { category: 'software-cloud', key: 'tax.software-cloud', facts: {
      expenseNature: 'software_cloud', capitalizableAsset: false, prepaidMultiYear: false } },
    { category: 'payment-bank-fees', key: 'tax.payment-bank-fees', facts: {
      expenseNature: 'financial_service_fee', financialActivityType: 'payment_processing_fee' } },
    { category: 'business-license', key: 'tax.business-license', facts: {
      expenseNature: 'business_license', governmentPaymentType: 'ordinary_current_business_license', currentBusiness: true } },
  ] as const

  it.each(productionCases)('resolves qualifying $key evidence and pins authority/version', ({ category, key, facts }) => {
    const result = evaluateProductionTaxRules({ taxYear: 2025, taxCategoryKey: category,
      businessAllocationAmountCents: -7_000, facts: { transactionNature: 'expense',
        businessPurpose: 'Established current business purpose.', businessUseTreatment: 'mixed',
        conflictingEvidence: false, ...facts } })
    expect(result).toMatchObject({ status: 'resolved', ruleKey: key, ruleVersion: 1,
      taxYear: 2025, deductibleAmountCents: -7_000, outcomeType: 'full_deduction' })
    if (result.status === 'resolved') {
      expect(result.authorityReferences).toHaveLength(2)
      expect(result.authorityReferences.every((reference) => reference.officialUrl.startsWith('https://www.irs.gov/')
        && reference.lastVerifiedOn === '2026-08-19')).toBe(true)
    }
  })

  it.each(productionCases)('fails closed for missing, conflicting, personal, and unsupported-year $key evidence',
    ({ category, facts }) => {
      const base = { taxYear: 2025, taxCategoryKey: category, businessAllocationAmountCents: -10_000,
        facts: { transactionNature: 'expense', businessPurpose: 'Business purpose',
          businessUseTreatment: 'business', conflictingEvidence: false, ...facts } }
      expect(evaluateProductionTaxRules({ ...base, facts: { ...base.facts, businessPurpose: null } }))
        .toMatchObject({ status: 'unresolved', reason: 'missing_evidence' })
      expect(evaluateProductionTaxRules({ ...base, facts: { ...base.facts, conflictingEvidence: true } }))
        .toMatchObject({ status: 'unresolved' })
      expect(evaluateProductionTaxRules({ ...base, facts: { ...base.facts, businessUseTreatment: 'personal' } }))
        .toMatchObject({ status: 'unresolved' })
      expect(evaluateProductionTaxRules({ ...base, taxYear: 2026 }))
        .toMatchObject({ status: 'unresolved', reason: 'unsupported_tax_year' })
    })

  it('enforces rule-specific exclusions and keeps Realtor context inside universal rules', () => {
    const common = { taxYear: 2025, businessAllocationAmountCents: -10_000,
      facts: { transactionNature: 'expense', businessPurpose: 'Business purpose',
        businessUseTreatment: 'business', conflictingEvidence: false } }
    expect(evaluateProductionTaxRules({ ...common, taxCategoryKey: 'office-expense', facts: {
      ...common.facts, expenseNature: 'office_expense', durableProperty: true, inventoryOrResale: false } }))
      .toMatchObject({ status: 'unresolved' })
    expect(evaluateProductionTaxRules({ ...common, taxCategoryKey: 'supplies', facts: {
      ...common.facts, expenseNature: 'advertising', durableProperty: false, inventoryOrResale: false } }))
      .toMatchObject({ status: 'unresolved' })
    expect(evaluateProductionTaxRules({ ...common, taxCategoryKey: 'postage-shipping', facts: {
      ...common.facts, expenseNature: 'postage_shipping', shippingCostContext: 'capital_asset' } }))
      .toMatchObject({ status: 'unresolved' })
    expect(evaluateProductionTaxRules({ ...common, taxCategoryKey: 'software-cloud', facts: {
      ...common.facts, expenseNature: 'software_cloud', capitalizableAsset: true, prepaidMultiYear: false } }))
      .toMatchObject({ status: 'unresolved' })
    for (const financialActivityType of ['interest', 'penalty', 'loan_principal', 'loan_repayment', 'transfer']) {
      expect(evaluateProductionTaxRules({ ...common, taxCategoryKey: 'payment-bank-fees', facts: {
        ...common.facts, expenseNature: 'financial_service_fee', financialActivityType } }))
        .toMatchObject({ status: 'unresolved' })
    }
    for (const governmentPaymentType of ['fine', 'penalty', 'tax', 'new_business', 'unknown']) {
      expect(evaluateProductionTaxRules({ ...common, taxCategoryKey: 'business-license', facts: {
        ...common.facts, expenseNature: 'business_license', governmentPaymentType, currentBusiness: true } }))
        .toMatchObject({ status: 'unresolved' })
    }
    expect(evaluateProductionTaxRules({ ...common, taxCategoryKey: 'advertising', facts: {
      ...common.facts, expenseNature: 'advertising', capitalizableAsset: false,
      businessProfileContext: 'realtor' } })).toMatchObject({ status: 'resolved', ruleKey: 'tax.advertising' })
  })

  it('distinguishes operating supplies from customer-job materials and future-sale inventory', () => {
    const base = { taxYear: 2025, taxCategoryKey: 'supplies', businessAllocationAmountCents: -10_000,
      facts: { transactionNature: 'expense', businessPurpose: 'Used in the business.',
        businessUseTreatment: 'business', expenseNature: 'consumable_supplies',
        conflictingEvidence: false, durableProperty: false, inventoryOrResale: false } }
    expect(evaluateProductionTaxRules({ ...base, facts: {
      ...base.facts, supplyUseContext: 'operating_supply' } }))
      .toMatchObject({ status: 'resolved', ruleKey: 'tax.supplies', deductibleAmountCents: -10_000 })
    for (const supplyUseContext of ['specific_customer_job', 'held_for_future_sale']) {
      for (const businessProfileContext of ['trade_service', 'realtor']) {
        const result = evaluateProductionTaxRules({ ...base, facts: { ...base.facts, supplyUseContext,
          businessProfileContext } })
        expect(result).toMatchObject({ status: 'unresolved' })
        expect(result).not.toHaveProperty('deductibleAmountCents')
      }
    }
    expect(evaluateProductionTaxRules({ ...base, facts: { ...base.facts,
      supplyUseContext: 'held_for_future_sale', inventoryOrResale: true } }))
      .toMatchObject({ status: 'unresolved' })
    expect(PRODUCTION_TAX_RULE_CATALOG.rules.filter((rule) => rule.lifecycle === 'active')).toHaveLength(7)
    const otherRules = PRODUCTION_TAX_RULE_CATALOG.rules.filter((rule) => rule.key !== 'tax.supplies')
    expect(otherRules).toHaveLength(6)
    expect(otherRules.every((rule) => !rule.requiredFacts.includes('supplyUseContext'))).toBe(true)
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
      .toMatchObject({ status: 'resolved', ruleKey: 'tax.fixture-potential-ready' })
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG, input('fixture-retired')))
      .toMatchObject({ status: 'unresolved', reason: 'no_active_rule' })
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG, input('fixture-approved')))
      .toMatchObject({ status: 'unresolved', reason: 'no_active_rule' })
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG,
      input('fixture-full', { taxYear: 2025 }))).toMatchObject({ status: 'unresolved', reason: 'unsupported_tax_year' })
  })

  it('pins the conclusion to the active tax-year rule version without reviving retired history', () => {
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG, input('fixture-versioned')))
      .toMatchObject({ status: 'resolved', ruleKey: 'tax.fixture-versioned', ruleVersion: 2, taxYear: 2026 })
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

  it('uses one tax namespace and treats business profile only as optional factual context', () => {
    expect(() => validateTaxRuleCatalog({ kind: 'test_fixture', catalogVersion: 1,
      rules: [{ ...FICTIONAL_TAX_RULE_CATALOG.rules[0], key: 'realtor.fixture' as 'tax.fixture' }] }))
      .toThrow(/Invalid tax-rule key/i)
    expect(FICTIONAL_TAX_RULE_CATALOG.rules.every((rule) => !('profiles' in rule))).toBe(true)
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG,
      input('fixture-profile-context', { facts: { businessPurpose: 'Synthetic test fact',
        businessProfileContext: 'realtor' } })))
      .toMatchObject({ status: 'resolved', ruleKey: 'tax.fixture-profile-context' })
    expect(evaluateFixtureTaxRules(FICTIONAL_TAX_RULE_CATALOG,
      input('fixture-profile-context')))
      .toMatchObject({ status: 'unresolved', reason: 'missing_evidence',
        missingFacts: ['businessProfileContext'] })
  })
})
