import type {
  TaxRuleCatalog, TaxRuleDefinition, TaxRuleFacts, TaxRuleFactValue,
} from './tax-rule-catalog'
import { PRODUCTION_TAX_RULE_CATALOG, validateTaxRuleCatalog } from './tax-rule-catalog'

export type TaxRuleEvaluationInput = {
  taxYear: number
  taxCategoryKey: string
  businessAllocationAmountCents: number
  facts: TaxRuleFacts
}

export type TaxRuleEvaluation =
  | { status: 'unresolved'; reason: 'no_active_rule' | 'unsupported_tax_year' | 'missing_evidence' | 'conflicting_rules';
      missingFacts: string[]; ruleIdentities: string[] }
  | { status: 'special_treatment'; ruleKey: string; ruleVersion: number; taxYear: number;
      treatmentKey: string; reason: string; factualBasis: TaxRuleFacts;
      authorityReferences: TaxRuleDefinition['authorityReferences'] }
  | { status: 'resolved'; ruleKey: string; ruleVersion: number; taxYear: number;
      treatmentStatus: 'deductible' | 'not_deductible'; deductibleAmountCents: number;
      taxCategoryKey: string; outcomeType: 'full_deduction' | 'fixed_fraction' | 'nondeductible';
      adjustmentMethod: 'none' | 'fixed_fraction'; reason: string; factualBasis: TaxRuleFacts;
      authorityReferences: TaxRuleDefinition['authorityReferences'] }

function conditionMatches(rule: TaxRuleDefinition, facts: TaxRuleFacts) {
  return rule.conditions.every((condition) => {
    const actual = facts[condition.fact]
    if (actual == null) return false
    if (condition.operator === 'equals') return actual === condition.value
    return Array.isArray(condition.value) && condition.value.includes(actual as never)
  })
}

function conditionNotDisproved(rule: TaxRuleDefinition, facts: TaxRuleFacts) {
  return rule.conditions.every((condition) => facts[condition.fact] == null
    || conditionMatches({ ...rule, conditions: [condition] }, facts))
}

function requiredMissing(rule: TaxRuleDefinition, facts: TaxRuleFacts) {
  return rule.requiredFacts.filter((fact) => facts[fact] == null)
}

function factualBasis(rule: TaxRuleDefinition, facts: TaxRuleFacts) {
  return Object.fromEntries(rule.requiredFacts
    .filter((key) => facts[key] != null).map((key) => [key, facts[key] as TaxRuleFactValue])) as TaxRuleFacts
}

function roundedFraction(amount: number, numerator: number, denominator: number) {
  const magnitude = Math.round((Math.abs(amount) * numerator) / denominator)
  const result = Math.sign(amount) * magnitude
  if (!Number.isSafeInteger(result)) throw new Error('Tax adjustment exceeds safe integer cents.')
  return result
}

function evaluate(catalog: TaxRuleCatalog, input: TaxRuleEvaluationInput): TaxRuleEvaluation {
  validateTaxRuleCatalog(catalog)
  if (!Number.isSafeInteger(input.taxYear) || !Number.isSafeInteger(input.businessAllocationAmountCents)
    || input.businessAllocationAmountCents === 0) {
    throw new Error('Tax evaluation requires a valid year and nonzero canonical business allocation.')
  }
  const categoryRules = catalog.rules.filter((rule) => rule.lifecycle === 'active'
    && rule.taxCategoryKey === input.taxCategoryKey)
  if (!categoryRules.length) {
    return { status: 'unresolved', reason: 'no_active_rule', missingFacts: [], ruleIdentities: [] }
  }
  const inYear = categoryRules.filter((rule) => input.taxYear >= rule.taxYears.from
    && input.taxYear <= rule.taxYears.through)
  if (!inYear.length) {
    return { status: 'unresolved', reason: 'unsupported_tax_year', missingFacts: [],
      ruleIdentities: categoryRules.map((rule) => `${rule.key}@${rule.version}`) }
  }
  const potential = inYear.filter((rule) => conditionNotDisproved(rule, input.facts))
  const missingByRule = potential.map((rule) => ({ rule, missing: requiredMissing(rule, input.facts) }))
  const missingFacts = [...new Set(missingByRule.flatMap(({ missing }) => missing))].sort()
  if (missingFacts.length) {
    return { status: 'unresolved', reason: 'missing_evidence', missingFacts,
      ruleIdentities: potential.map((rule) => `${rule.key}@${rule.version}`) }
  }
  const ready = missingByRule
    .map(({ rule }) => rule).filter((rule) => conditionMatches(rule, input.facts))
  if (!ready.length) {
    return { status: 'unresolved', reason: 'no_active_rule', missingFacts: [],
      ruleIdentities: inYear.map((rule) => `${rule.key}@${rule.version}`) }
  }
  if (ready.length !== 1) {
    return { status: 'unresolved', reason: 'conflicting_rules', missingFacts: [],
      ruleIdentities: ready.map((rule) => `${rule.key}@${rule.version}`).sort() }
  }
  const rule = ready[0]
  const basis = factualBasis(rule, input.facts)
  if (rule.outcome.type === 'special_treatment') {
    return { status: 'special_treatment', ruleKey: rule.key, ruleVersion: rule.version,
      taxYear: input.taxYear, treatmentKey: rule.outcome.treatmentKey,
      reason: rule.explanationTemplate, factualBasis: basis,
      authorityReferences: rule.authorityReferences }
  }
  const deductibleAmountCents = rule.outcome.type === 'full_deduction'
    ? input.businessAllocationAmountCents
    : rule.outcome.type === 'fixed_fraction'
      ? roundedFraction(input.businessAllocationAmountCents, rule.outcome.numerator, rule.outcome.denominator)
      : 0
  return { status: 'resolved', ruleKey: rule.key, ruleVersion: rule.version, taxYear: input.taxYear,
    treatmentStatus: rule.outcome.type === 'nondeductible' ? 'not_deductible' : 'deductible',
    deductibleAmountCents, taxCategoryKey: input.taxCategoryKey, outcomeType: rule.outcome.type,
    adjustmentMethod: rule.outcome.type === 'fixed_fraction' ? 'fixed_fraction' : 'none',
    reason: rule.explanationTemplate, factualBasis: basis, authorityReferences: rule.authorityReferences }
}

export function evaluateProductionTaxRules(input: TaxRuleEvaluationInput) {
  return evaluate(PRODUCTION_TAX_RULE_CATALOG, input)
}

/** Explicit test seam. Test fixture catalogs are rejected by the production entry point. */
export function evaluateFixtureTaxRules(catalog: TaxRuleCatalog, input: TaxRuleEvaluationInput) {
  if (catalog.kind !== 'test_fixture') throw new Error('Fixture evaluation requires a test-only catalog.')
  return evaluate(catalog, input)
}
