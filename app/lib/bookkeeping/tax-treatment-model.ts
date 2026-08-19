export const TAX_TREATMENT_STATUSES = [
  'unresolved', 'requires_facts', 'deductible', 'not_deductible', 'special_treatment',
] as const
export type TaxTreatmentStatus = typeof TAX_TREATMENT_STATUSES[number]

export type CanonicalTaxTreatment = {
  id: string
  allocationId: string
  supersedesTaxTreatmentId: string | null
  status: TaxTreatmentStatus
  deductibleAmountCents: number | null
  taxCategoryKey: string | null
  ruleKey: string | null
  ruleVersion: number | null
  reason: string
  provenance: 'automation' | 'system'
  confidence: number | null
  taxYear?: number | null
  outcomeType?: 'full_deduction' | 'fixed_fraction' | 'nondeductible' | 'special_treatment' | null
  adjustmentMethod?: 'none' | 'fixed_fraction' | 'special_calculation' | null
  factualBasis?: Record<string, string | number | boolean | null>
  authorityReferences?: Array<Record<string, string | null>>
}

export function currentTaxTreatment(history: CanonicalTaxTreatment[]) {
  if (!history.length) return null
  const superseded = new Set(history.map((item) => item.supersedesTaxTreatmentId).filter(Boolean))
  const leaves = history.filter((item) => !superseded.has(item.id))
  if (leaves.length !== 1) throw new Error('Tax-treatment history must have exactly one current leaf.')
  return leaves[0]
}

export function validateTrustedTaxTreatment(input: {
  allocationAmountCents: number
  status: TaxTreatmentStatus
  deductibleAmountCents: number | null
  taxCategoryKey: string | null
  ruleKey: string | null
  ruleVersion: number | null
  reason: string
}) {
  if (!Number.isSafeInteger(input.allocationAmountCents) || input.allocationAmountCents === 0) {
    throw new Error('A valid canonical allocation is required.')
  }
  if (!input.reason.trim() || input.reason.trim().length > 1000) {
    throw new Error('A concise trusted tax-treatment reason is required.')
  }
  if (input.status === 'unresolved') {
    if (input.deductibleAmountCents !== null || input.taxCategoryKey !== null) {
      throw new Error('Unresolved tax treatment cannot claim a category or deduction.')
    }
  } else if (input.status === 'requires_facts' || input.status === 'special_treatment') {
    if (input.deductibleAmountCents !== null || !input.taxCategoryKey || !input.ruleKey
      || !Number.isSafeInteger(input.ruleVersion) || input.ruleVersion! < 1) {
      throw new Error('Pending or special tax treatment requires a versioned rule but no deduction.')
    }
  } else if (!input.taxCategoryKey || !input.ruleKey || !Number.isSafeInteger(input.ruleVersion) || input.ruleVersion! < 1) {
    throw new Error('Resolved tax treatment requires a supported category and versioned rule.')
  }
  if (input.status === 'not_deductible' && input.deductibleAmountCents !== 0) {
    throw new Error('Nondeductible treatment must have a zero deductible amount.')
  }
  if (input.status === 'deductible') {
    const amount = input.deductibleAmountCents
    if (!Number.isSafeInteger(amount) || amount === 0 || Math.sign(amount!) !== Math.sign(input.allocationAmountCents)
      || Math.abs(amount!) > Math.abs(input.allocationAmountCents)) {
      throw new Error('Deductible amount must be a signed portion of the canonical allocation.')
    }
  }
}

export function validateTaxRuleAudit(input: {
  status: TaxTreatmentStatus
  taxYear: number | null
  outcomeType: CanonicalTaxTreatment['outcomeType']
  adjustmentMethod: CanonicalTaxTreatment['adjustmentMethod']
  authorityReferences: CanonicalTaxTreatment['authorityReferences']
}) {
  if (input.status === 'unresolved') {
    if (input.taxYear !== null || input.outcomeType !== null || input.adjustmentMethod !== null) {
      throw new Error('Unresolved treatment cannot claim evaluated rule audit metadata.')
    }
    return
  }
  if (!Number.isSafeInteger(input.taxYear) || input.taxYear! < 2000 || input.taxYear! > 2200
    || !input.outcomeType || !input.adjustmentMethod || !input.authorityReferences?.length) {
    throw new Error('Rule-based tax treatment requires year, outcome, adjustment, and authority metadata.')
  }
  const valid = (input.status === 'deductible'
      && ((input.outcomeType === 'full_deduction' && input.adjustmentMethod === 'none')
        || (input.outcomeType === 'fixed_fraction' && input.adjustmentMethod === 'fixed_fraction')))
    || (input.status === 'not_deductible' && input.outcomeType === 'nondeductible'
      && input.adjustmentMethod === 'none')
    || (input.status === 'special_treatment' && input.outcomeType === 'special_treatment'
      && input.adjustmentMethod === 'special_calculation')
    || input.status === 'requires_facts'
  if (!valid) throw new Error('Tax-treatment status and downstream adjustment metadata are inconsistent.')
}
