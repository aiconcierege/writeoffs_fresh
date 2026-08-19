import type { TaxRuleCatalog, TaxRuleDefinition } from '../../app/lib/bookkeeping/tax-rule-catalog'

const authority = [{ authority: 'internal_review' as const, identifier: 'FICTIONAL-TEST-ONLY',
  revision: null, topic: 'Synthetic rule-engine fixture', officialUrl: 'https://www.irs.gov/',
  supportStatement: 'Fictional test metadata only.', lastVerifiedOn: '2026-01-01' }]
const approval = { reviewReference: 'TEST-ONLY-NOT-LEGAL-APPROVAL', approvedAt: '2026-01-01' }

function rule(input: Partial<TaxRuleDefinition> & Pick<TaxRuleDefinition, 'key' | 'taxCategoryKey' | 'outcome'>): TaxRuleDefinition {
  return { version: 1, lifecycle: 'active', taxYears: { from: 2026, through: 2026 },
    automationLevel: 'safe_automatic', requiredFacts: ['businessPurpose'],
    conditions: [], explanationTemplate: 'Fictional test conclusion from supplied business-purpose facts.',
    authorityReferences: authority, approval, ...input }
}

/** Synthetic engine fixtures. Never import this module from application code. */
export const FICTIONAL_TAX_RULE_CATALOG: TaxRuleCatalog = {
  kind: 'test_fixture', catalogVersion: 1, rules: [
    rule({ key: 'tax.fixture-full', taxCategoryKey: 'fixture-full', outcome: { type: 'full_deduction' } }),
    rule({ key: 'tax.fixture-half', taxCategoryKey: 'fixture-half',
      outcome: { type: 'fixed_fraction', numerator: 1, denominator: 2, rounding: 'nearest_cent' } }),
    rule({ key: 'tax.fixture-none', taxCategoryKey: 'fixture-none', outcome: { type: 'nondeductible' } }),
    rule({ key: 'tax.fixture-ask', taxCategoryKey: 'fixture-ask', automationLevel: 'ask_first',
      requiredFacts: ['businessPurpose', 'assetIndicator'], outcome: { type: 'full_deduction' } }),
    rule({ key: 'tax.fixture-profile-context', taxCategoryKey: 'fixture-profile-context',
      requiredFacts: ['businessPurpose', 'businessProfileContext'],
      conditions: [{ fact: 'businessProfileContext', operator: 'equals', value: 'realtor' }],
      outcome: { type: 'full_deduction' } }),
    rule({ key: 'tax.fixture-special', taxCategoryKey: 'fixture-special', automationLevel: 'special_treatment',
      outcome: { type: 'special_treatment', treatmentKey: 'fictional_annual_calculation' } }),
    rule({ key: 'tax.fixture-conflict-a', taxCategoryKey: 'fixture-conflict', outcome: { type: 'full_deduction' } }),
    rule({ key: 'tax.fixture-conflict-b', taxCategoryKey: 'fixture-conflict', outcome: { type: 'nondeductible' } }),
    rule({ key: 'tax.fixture-potential-ready', taxCategoryKey: 'fixture-potential',
      conditions: [{ fact: 'businessPurpose', operator: 'equals', value: 'Synthetic test fact' }],
      outcome: { type: 'full_deduction' } }),
    rule({ key: 'tax.fixture-potential-missing', taxCategoryKey: 'fixture-potential',
      requiredFacts: ['businessPurpose', 'assetIndicator'],
      conditions: [{ fact: 'assetIndicator', operator: 'equals', value: true }],
      outcome: { type: 'nondeductible' } }),
    rule({ key: 'tax.fixture-retired', taxCategoryKey: 'fixture-retired', lifecycle: 'retired',
      outcome: { type: 'full_deduction' } }),
    rule({ key: 'tax.fixture-candidate', taxCategoryKey: 'fixture-candidate', lifecycle: 'candidate',
      approval: null, authorityReferences: [], outcome: { type: 'full_deduction' } }),
    rule({ key: 'tax.fixture-approved', taxCategoryKey: 'fixture-approved', lifecycle: 'approved',
      outcome: { type: 'full_deduction' } }),
    rule({ key: 'tax.fixture-versioned', version: 1, lifecycle: 'retired',
      taxYears: { from: 2025, through: 2025 }, taxCategoryKey: 'fixture-versioned',
      outcome: { type: 'nondeductible' } }),
    rule({ key: 'tax.fixture-versioned', version: 2, taxCategoryKey: 'fixture-versioned',
      outcome: { type: 'full_deduction' } }),
  ]
}
