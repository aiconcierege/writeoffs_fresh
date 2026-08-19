import type { TaxRuleCatalog, TaxRuleDefinition } from '../../app/lib/bookkeeping/tax-rule-catalog'

const authority = [{ authority: 'internal_review' as const, identifier: 'FICTIONAL-TEST-ONLY',
  revision: null, topic: 'Synthetic rule-engine fixture' }]
const approval = { reviewReference: 'TEST-ONLY-NOT-LEGAL-APPROVAL', approvedAt: '2026-01-01' }

function rule(input: Partial<TaxRuleDefinition> & Pick<TaxRuleDefinition, 'key' | 'taxCategoryKey' | 'outcome'>): TaxRuleDefinition {
  return { version: 1, lifecycle: 'active', taxYears: { from: 2026, through: 2026 },
    profiles: ['general', 'realtor'], automationLevel: 'safe_automatic', requiredFacts: ['businessPurpose'],
    conditions: [], explanationTemplate: 'Fictional test conclusion from supplied business-purpose facts.',
    authorityReferences: authority, approval, ...input }
}

/** Synthetic engine fixtures. Never import this module from application code. */
export const FICTIONAL_TAX_RULE_CATALOG: TaxRuleCatalog = {
  kind: 'test_fixture', catalogVersion: 1, rules: [
    rule({ key: 'shared.fixture-full', taxCategoryKey: 'fixture-full', outcome: { type: 'full_deduction' } }),
    rule({ key: 'shared.fixture-half', taxCategoryKey: 'fixture-half',
      outcome: { type: 'fixed_fraction', numerator: 1, denominator: 2, rounding: 'nearest_cent' } }),
    rule({ key: 'shared.fixture-none', taxCategoryKey: 'fixture-none', outcome: { type: 'nondeductible' } }),
    rule({ key: 'shared.fixture-ask', taxCategoryKey: 'fixture-ask', automationLevel: 'ask_first',
      requiredFacts: ['businessPurpose', 'assetIndicator'], outcome: { type: 'full_deduction' } }),
    rule({ key: 'shared.fixture-special', taxCategoryKey: 'fixture-special', automationLevel: 'special_treatment',
      outcome: { type: 'special_treatment', treatmentKey: 'fictional_annual_calculation' } }),
    rule({ key: 'shared.fixture-conflict-a', taxCategoryKey: 'fixture-conflict', outcome: { type: 'full_deduction' } }),
    rule({ key: 'shared.fixture-conflict-b', taxCategoryKey: 'fixture-conflict', outcome: { type: 'nondeductible' } }),
    rule({ key: 'shared.fixture-potential-ready', taxCategoryKey: 'fixture-potential',
      conditions: [{ fact: 'businessPurpose', operator: 'equals', value: 'Synthetic test fact' }],
      outcome: { type: 'full_deduction' } }),
    rule({ key: 'shared.fixture-potential-missing', taxCategoryKey: 'fixture-potential',
      requiredFacts: ['businessPurpose', 'assetIndicator'],
      conditions: [{ fact: 'assetIndicator', operator: 'equals', value: true }],
      outcome: { type: 'nondeductible' } }),
    rule({ key: 'shared.fixture-retired', taxCategoryKey: 'fixture-retired', lifecycle: 'retired',
      outcome: { type: 'full_deduction' } }),
    rule({ key: 'shared.fixture-candidate', taxCategoryKey: 'fixture-candidate', lifecycle: 'candidate',
      approval: null, authorityReferences: [], outcome: { type: 'full_deduction' } }),
    rule({ key: 'shared.fixture-approved', taxCategoryKey: 'fixture-approved', lifecycle: 'approved',
      outcome: { type: 'full_deduction' } }),
    rule({ key: 'shared.fixture-versioned', version: 1, lifecycle: 'retired',
      taxYears: { from: 2025, through: 2025 }, taxCategoryKey: 'fixture-versioned',
      outcome: { type: 'nondeductible' } }),
    rule({ key: 'shared.fixture-versioned', version: 2, taxCategoryKey: 'fixture-versioned',
      outcome: { type: 'full_deduction' } }),
  ]
}
