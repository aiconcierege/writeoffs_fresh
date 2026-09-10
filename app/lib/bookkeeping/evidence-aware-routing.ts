import type { BookkeepingEvaluationSnapshot } from './deterministic-evaluator'

export const EVIDENCE_ROUTING_VERSION = 'bookkeeping-evidence-routing:v1' as const

export type EconomicContextSignal = {
  version: typeof EVIDENCE_ROUTING_VERSION
  context: 'telecom_service' | 'restaurant_meal'
  confidence: 'strong' | 'narrowed_confirmation'
  merchantScope: string
  evidence: Array<'merchant' | 'description' | 'plaid_category' | 'receipt_meal'>
}

function normalized(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 200)
}

function telecomScope(source: string, fallback: string) {
  if (/\bt mobile\b/.test(source)) return 't-mobile'
  if (/\bat t\b/.test(source)) return 'at&t'
  if (/\bverizon\b/.test(source)) return 'verizon'
  return normalized(TELECOM_PROVIDER.exec(source)?.[0] ?? fallback)
}

const TELECOM_PROVIDER = /\b(?:at t|boost mobile|consumer cellular|cricket wireless|google fi|mint mobile|spectrum mobile|t mobile|tracfone|us cellular|verizon|visible|xfinity mobile)\b/
const TELECOM_SERVICE = /\b(?:cell(?:ular)?|mobile|phone|telephone|telecom(?:munications)?|wireless)\b/
const TELECOM_PLAID = /(?:TELECOMMUNICATION|PHONE|WIRELESS|CABLE)/
const RESTAURANT_PLAID = /(?:FOOD_AND_DRINK|RESTAURANT|FAST_FOOD|COFFEE)/
const RESTAURANT_MERCHANT = /\b(?:bar and grill|bistro|cafe|coffee|diner|grill|grille|kitchen|pizzeria|restaurant|steakhouse|sushi)\b/
const ORDINARY_EXPENSE_PLAID = /^(?:GENERAL_MERCHANDISE|GENERAL_SERVICES|HOME_IMPROVEMENT|MEDICAL|PERSONAL_CARE|RENT_AND_UTILITIES|TRANSPORTATION|TRAVEL)$/

export function hasStrongOrdinaryExpenseEvidence(input: {
  amountCents: number | null
  plaidPrimary?: string | null
}) {
  return input.amountCents != null && input.amountCents < 0
    && ORDINARY_EXPENSE_PLAID.test((input.plaidPrimary ?? '').toUpperCase())
}

export function economicContextSignal(input: {
  amountCents: number | null
  merchantName?: string | null
  description?: string | null
  plaidPrimary?: string | null
  plaidDetailed?: string | null
  receiptMealSupported?: boolean
}): EconomicContextSignal | null {
  if (input.amountCents == null || input.amountCents >= 0) return null
  const merchant = normalized(input.merchantName)
  const description = normalized(input.description)
  const source = `${merchant} ${description}`.trim()
  const plaid = `${input.plaidPrimary ?? ''} ${input.plaidDetailed ?? ''}`.toUpperCase()
  const evidence: EconomicContextSignal['evidence'] = []

  if (TELECOM_PROVIDER.test(source) || TELECOM_SERVICE.test(source) || TELECOM_PLAID.test(plaid)) {
    if (merchant) evidence.push('merchant')
    if (description && description !== merchant) evidence.push('description')
    if (TELECOM_PLAID.test(plaid)) evidence.push('plaid_category')
    const strong = TELECOM_PROVIDER.test(source)
      || (TELECOM_SERVICE.test(source) && TELECOM_PLAID.test(plaid))
    return {
      version: EVIDENCE_ROUTING_VERSION,
      context: 'telecom_service',
      confidence: strong ? 'strong' : 'narrowed_confirmation',
      merchantScope: telecomScope(source, merchant || description),
      evidence,
    }
  }

  if (input.receiptMealSupported || RESTAURANT_PLAID.test(plaid) || RESTAURANT_MERCHANT.test(source)) {
    if (merchant) evidence.push('merchant')
    if (description && description !== merchant) evidence.push('description')
    if (RESTAURANT_PLAID.test(plaid)) evidence.push('plaid_category')
    if (input.receiptMealSupported) evidence.push('receipt_meal')
    return {
      version: EVIDENCE_ROUTING_VERSION,
      context: 'restaurant_meal',
      confidence: input.receiptMealSupported || RESTAURANT_PLAID.test(plaid)
        ? 'strong' : 'narrowed_confirmation',
      merchantScope: merchant || description,
      evidence,
    }
  }
  return null
}

export function snapshotEconomicContext(snapshot: BookkeepingEvaluationSnapshot) {
  return economicContextSignal({
    amountCents: snapshot.amountCents,
    merchantName: snapshot.merchantName,
    description: snapshot.description,
    plaidPrimary: snapshot.personalFinanceCategory?.primary,
    plaidDetailed: snapshot.personalFinanceCategory?.detailed,
    receiptMealSupported: snapshot.receiptMealSupported,
  })
}
