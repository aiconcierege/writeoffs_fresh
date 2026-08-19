export const TAX_RULE_LIFECYCLES = ['candidate', 'approved', 'active', 'retired'] as const
export type TaxRuleLifecycle = typeof TAX_RULE_LIFECYCLES[number]

export const TAX_RULE_AUTOMATION_LEVELS = ['safe_automatic', 'ask_first', 'special_treatment'] as const
export type TaxRuleAutomationLevel = typeof TAX_RULE_AUTOMATION_LEVELS[number]

export const TAX_RULE_FACT_KEYS = [
  'transactionNature', 'businessPurpose', 'businessUseTreatment', 'personalAmountCents',
  'merchantServiceType', 'receiptPresent', 'occurredOn', 'assetIndicator',
  'travelAwayFromHome', 'mealBusinessContext', 'giftRecipientKnown',
  'homeOfficeQualified', 'vehicleUseFactsComplete', 'reimbursementStatus',
  'businessProfileContext',
] as const
export type TaxRuleFactKey = typeof TAX_RULE_FACT_KEYS[number]
export type TaxRuleFactValue = string | number | boolean
export type TaxRuleFacts = Partial<Record<TaxRuleFactKey, TaxRuleFactValue | null>>

export type TaxRuleAuthorityReference = {
  authority: 'irs_form' | 'irs_instructions' | 'irs_publication' | 'internal_review'
  identifier: string
  revision: string | null
  topic: string
}

export type TaxRuleCondition = {
  fact: TaxRuleFactKey
  operator: 'equals' | 'one_of'
  value: TaxRuleFactValue | TaxRuleFactValue[]
}

export type TaxRuleOutcome =
  | { type: 'full_deduction' }
  | { type: 'fixed_fraction'; numerator: number; denominator: number; rounding: 'nearest_cent' }
  | { type: 'nondeductible' }
  | { type: 'special_treatment'; treatmentKey: string }

export type TaxRuleDefinition = {
  key: `tax.${string}`
  version: number
  lifecycle: TaxRuleLifecycle
  taxYears: { from: number; through: number }
  taxCategoryKey: string
  automationLevel: TaxRuleAutomationLevel
  requiredFacts: TaxRuleFactKey[]
  conditions: TaxRuleCondition[]
  outcome: TaxRuleOutcome
  explanationTemplate: string
  authorityReferences: TaxRuleAuthorityReference[]
  approval: null | { reviewReference: string; approvedAt: string }
}

export type TaxRuleCatalog = {
  kind: 'production' | 'test_fixture'
  catalogVersion: number
  rules: TaxRuleDefinition[]
}

function assertInteger(value: number, message: string) {
  if (!Number.isSafeInteger(value)) throw new Error(message)
}

export function validateTaxRuleCatalog(catalog: TaxRuleCatalog) {
  assertInteger(catalog.catalogVersion, 'Tax-rule catalog version must be an integer.')
  if (catalog.catalogVersion < 1) throw new Error('Tax-rule catalog version must be positive.')
  const identities = new Set<string>()
  for (const rule of catalog.rules) {
    if (!/^tax\.[a-z0-9][a-z0-9._-]*$/.test(rule.key)) {
      throw new Error(`Invalid tax-rule key: ${rule.key}`)
    }
    assertInteger(rule.version, `Tax-rule version must be an integer: ${rule.key}`)
    assertInteger(rule.taxYears.from, `Tax-rule start year must be an integer: ${rule.key}`)
    assertInteger(rule.taxYears.through, `Tax-rule end year must be an integer: ${rule.key}`)
    if (rule.version < 1 || rule.taxYears.from < 2000 || rule.taxYears.through < rule.taxYears.from) {
      throw new Error(`Invalid tax-rule version or year range: ${rule.key}`)
    }
    const identity = `${rule.key}@${rule.version}`
    if (identities.has(identity)) throw new Error(`Duplicate tax-rule identity: ${identity}`)
    identities.add(identity)
    if (!rule.taxCategoryKey.trim() || !rule.explanationTemplate.trim()) {
      throw new Error(`Tax rule is missing required catalog metadata: ${identity}`)
    }
    if (new Set(rule.requiredFacts).size !== rule.requiredFacts.length) {
      throw new Error(`Tax rule repeats a factual requirement: ${identity}`)
    }
    if (rule.conditions.some((condition) => !rule.requiredFacts.includes(condition.fact))) {
      throw new Error(`Tax-rule conditions must declare their required factual evidence: ${identity}`)
    }
    if (rule.outcome.type === 'fixed_fraction') {
      assertInteger(rule.outcome.numerator, `Invalid fraction numerator: ${identity}`)
      assertInteger(rule.outcome.denominator, `Invalid fraction denominator: ${identity}`)
      if (rule.outcome.numerator <= 0 || rule.outcome.denominator <= 0
        || rule.outcome.numerator >= rule.outcome.denominator) {
        throw new Error(`Fixed tax fraction must be between zero and one: ${identity}`)
      }
    }
    if (rule.automationLevel === 'special_treatment' && rule.outcome.type !== 'special_treatment') {
      throw new Error(`Special-treatment rules require a special outcome: ${identity}`)
    }
    if (rule.lifecycle === 'candidate' && rule.approval) {
      throw new Error(`Candidate tax rule cannot carry approval metadata: ${identity}`)
    }
    if (rule.lifecycle === 'approved' || rule.lifecycle === 'active') {
      if (!rule.approval || !rule.authorityReferences.length) {
        throw new Error(`Approved tax rule lacks approval or authority metadata: ${identity}`)
      }
      if (!rule.approval.reviewReference.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(rule.approval.approvedAt)) {
        throw new Error(`Tax-rule approval metadata is invalid: ${identity}`)
      }
    }
    if (rule.authorityReferences.some((reference) => !reference.identifier.trim() || !reference.topic.trim())) {
      throw new Error(`Tax-rule authority metadata is invalid: ${identity}`)
    }
    if (catalog.kind === 'production' && rule.lifecycle === 'active'
      && rule.authorityReferences.some((reference) => reference.authority === 'internal_review')) {
      throw new Error(`Active production rule requires an external authority reference: ${identity}`)
    }
  }
  return catalog
}

/** Deliberately empty until product/legal approves concrete, sourced tax rules. */
export const PRODUCTION_TAX_RULE_CATALOG: TaxRuleCatalog = Object.freeze({
  kind: 'production', catalogVersion: 1, rules: Object.freeze([]) as unknown as TaxRuleDefinition[],
})
