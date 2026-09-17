import { snapshotEconomicContext } from './evidence-aware-routing'
import type { BookkeepingEvaluationSnapshot } from './deterministic-evaluator'
import type { TaxRuleFacts } from './tax-rule-catalog'
import { receiptPurchaseEvidence, receiptRestaurantEvidence, supportedMealPurpose } from './shared-evidence'

export const OPERATING_EXPENSE_CLASSIFIER_VERSION = 'schedule-c-operating-expense:v3' as const

export const SCHEDULE_C_OPERATING_CATEGORIES = {
  advertising: 'Advertising',
  commissions: 'Commissions and fees',
  'contract-labor': 'Contract labor',
  insurance: 'Insurance (other than health)',
  interest: 'Other business interest',
  'legal-professional': 'Legal and professional services',
  'office-expense': 'Office expense',
  'rent-other': 'Rent or lease — other business property',
  repairs: 'Repairs and maintenance',
  supplies: 'Supplies',
  'taxes-licenses': 'Taxes and licenses',
  travel: 'Travel',
  meals: 'Meals',
  utilities: 'Utilities',
  software: 'Software and subscriptions',
  postage: 'Postage and shipping',
  fees: 'Payment-processing and bank fees',
  'car-truck': 'Car and truck expenses',
  other: 'Other ordinary operating expenses',
} as const

export type OperatingExpenseCategoryKey = keyof typeof SCHEDULE_C_OPERATING_CATEGORIES
export type OperatingExpenseClassification = {
  version: typeof OPERATING_EXPENSE_CLASSIFIER_VERSION
  status: 'ordinary' | 'needs_facts' | 'special_treatment' | 'unsupported'
  categoryKey: OperatingExpenseCategoryKey | null
  expenseNature: string | null
  confidence: number
  reasonCode: string
  evidence: string[]
  taxFacts: TaxRuleFacts
}

const normalize = (value: string | null | undefined) =>
  (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/\b(flights|airlines|restaurants|meals|subscriptions|services|licenses)\b/g, word => word.slice(0, -1))

const patterns: Array<{ categoryKey: OperatingExpenseCategoryKey; nature: string; pattern: RegExp }> = [
  { categoryKey: 'car-truck', nature: 'vehicle_operating_expense', pattern: /\b(?:gasoline|vehicle fuel|auto insurance|car insurance|auto repair|car repair|oil change|vehicle maintenance|dmv registration|vehicle registration|car tires?|parking fee|road toll|vehicle lease payment|car lease payment)\b/ },
  { categoryKey: 'advertising', nature: 'advertising', pattern: /\b(?:advertis\w*|marketing|promotion|google ads|meta ads|facebook ads|mailchimp)\b/ },
  { categoryKey: 'commissions', nature: 'commissions_fees', pattern: /\b(?:commission|referral fee|broker fee|platform fee)\b/ },
  { categoryKey: 'contract-labor', nature: 'contract_labor', pattern: /\b(?:contractor|freelanc|subcontract|upwork|fiverr)\b/ },
  { categoryKey: 'insurance', nature: 'business_insurance', pattern: /\b(?:business insurance|liability insurance|professional liability|errors and omissions|e o insurance|commercial insurance)\b/ },
  { categoryKey: 'interest', nature: 'business_interest', pattern: /\b(?:interest charge|finance charge|business loan interest)\b/ },
  { categoryKey: 'legal-professional', nature: 'legal_professional', pattern: /\b(?:attorney|law firm|legal service|accountant|accounting|bookkeep|tax prepar|professional service)\b/ },
  { categoryKey: 'office-expense', nature: 'office_expense', pattern: /\b(?:office depot|office max|staples|printer ink|printer paper|copy paper|office paper|office supplies|stationery|office expense)\b/ },
  { categoryKey: 'rent-other', nature: 'rent_other_business_property', pattern: /\b(?:office rent|studio rent|cowork|co work|wework|regus|equipment rental|equipment lease)\b/ },
  { categoryKey: 'repairs', nature: 'repairs_maintenance', pattern: /\b(?:repair|maintenance|handyman|janitorial|cleaning service|hvac service)\b/ },
  { categoryKey: 'supplies', nature: 'consumable_supplies', pattern: /\b(?:business supplies|shipping supplies|cleaning supplies)\b/ },
  { categoryKey: 'taxes-licenses', nature: 'taxes_licenses', pattern: /\b(?:business license|professional license|occupational license|permit fee|registration fee)\b/ },
  { categoryKey: 'travel', nature: 'business_travel', pattern: /\b(?:hotel|motel|lodging|airline|airfare|flight|business travel|rideshare|ride fare|trip fare)\b/ },
  { categoryKey: 'meals', nature: 'business_meal', pattern: /\b(?:restaurant|cafe|coffee|diner|grill|grille|steakhouse|sushi|meal)\b/ },
  { categoryKey: 'utilities', nature: 'utilities', pattern: /\b(?:electric|electricity|water utility|natural gas utility|internet|broadband|telephone|telecom|wireless|mobile service)\b/ },
  { categoryKey: 'software', nature: 'software_subscription', pattern: /\b(?:software|subscription|saas|adobe|microsoft 365|google workspace|dropbox|quickbooks|zoom|slack|github|canva)\b/ },
  { categoryKey: 'postage', nature: 'postage_shipping', pattern: /\b(?:postage|shipping|fedex|ups store|usps|postal service|dhl)\b/ },
  { categoryKey: 'fees', nature: 'financial_service_fee', pattern: /\b(?:bank fee|service fee|processing fee|merchant fee|stripe fee|square fee|paypal fee|monthly fee)\b/ },
  { categoryKey: 'other', nature: 'other_ordinary_operating', pattern: /\b(?:business association dues|trade association dues|conference registration|business membership)\b/ },
]

const specialPatterns: Array<[RegExp, OperatingExpenseClassification['status'], string]> = [
  [/\b(?:inventory|merchandise for resale|cost of goods|wholesale stock)\b/, 'unsupported', 'INVENTORY_OR_COGS'],
  [/\b(?:payroll|paycheck|wages|salary|withholding|adp|paychex|gusto payroll)\b/, 'special_treatment', 'PAYROLL_RELATED'],
  [/\b(?:health insurance|medical insurance|dental insurance|vision insurance)\b/, 'special_treatment', 'OWNER_HEALTH_INSURANCE_REVIEW'],
  [/\b(?:home office|home utility|home rent|home mortgage)\b/, 'special_treatment', 'HOME_OFFICE_ALLOCATION_REQUIRED'],
  [/\b(?:federal income tax|state income tax|estimated tax|irs payment|sales tax remittance|payroll tax)\b/, 'special_treatment', 'GOVERNMENT_PAYMENT_REVIEW'],
  [/\b(?:penalty|fine|citation|charitable|donation|owner draw|owner distribution|loan principal)\b/, 'special_treatment', 'NONORDINARY_OR_NONDEDUCTIBLE_REVIEW'],
  [/\b(?:vehicle purchase|automobile purchase|bought (?:a )?(?:car|truck|van)|car down payment)\b/, 'special_treatment', 'VEHICLE_PURCHASE_CPA_REVIEW'],
  [/\b(?:vehicle improvement|engine replacement|transmission replacement)\b/, 'special_treatment', 'VEHICLE_IMPROVEMENT_CPA_REVIEW'],
  [/\b(?:car payment|vehicle expense|automobile expense|auto shop)\b/, 'special_treatment', 'VEHICLE_FACTS_REQUIRED'],
  [/\b(?:equipment|machinery|computer|laptop|furniture|mower|capital asset)\b/, 'special_treatment', 'POSSIBLE_ASSET'],
  [/\b(?:renovation|remodel|improvement|addition|restoration)\b/, 'special_treatment', 'POSSIBLE_CAPITAL_IMPROVEMENT'],
  [/\b(?:annual prepaid|multi year|multi-year|prepaid)\b/, 'special_treatment', 'POSSIBLE_PREPAYMENT'],
]

function plaidText(snapshot: BookkeepingEvaluationSnapshot) {
  return `${snapshot.personalFinanceCategory?.primary ?? ''} ${snapshot.personalFinanceCategory?.detailed ?? ''}`
    .toLowerCase().replace(/_/g, ' ')
}

/** Money movement must be evaluated before purchase/category evidence. */
export function expenseMovementReason(snapshot: BookkeepingEvaluationSnapshot): string | null {
  if ((snapshot.amountCents ?? 0) > 0) return 'INCOMING_MONEY_REQUIRES_SOURCE'
  const source = normalize(`${snapshot.description ?? ''} ${plaidText(snapshot)}`)
  if (/\b(?:loan payment|loan payments|payment.*credit card|credit card.*payment|payment received|automatic payment|transfer (?:to|from))\b/.test(source))
    return 'PAYMENT_OR_TRANSFER_REQUIRES_CONTEXT'
  return null
}

export function classifyOperatingExpense(snapshot: BookkeepingEvaluationSnapshot): OperatingExpenseClassification {
  const receiptEvidence = receiptPurchaseEvidence(snapshot)
  const receiptMeal = snapshot.receiptMealSupported || receiptRestaurantEvidence(snapshot).length > 0
  // A customer's specific purchase correction outranks provider/merchant text.
  // A generic business-purpose answer alone does not erase purchase evidence.
  const correction = normalize(snapshot.currentDecision.businessPurpose)
  const specificCorrection = (snapshot.currentDecision.provenance === 'user' || snapshot.customerFactsAuthoritative)
    && (patterns.some(({ pattern }) => pattern.test(correction))
      || specialPatterns.some(([pattern]) => pattern.test(correction)))
  const source = specificCorrection ? correction
    : normalize(`${snapshot.merchantName ?? ''} ${snapshot.description ?? ''} ${plaidText(snapshot)} ${snapshot.currentDecision.businessPurpose ?? ''} ${receiptEvidence.map(item => item.text).join(' ')}`)
  const baseFacts: TaxRuleFacts = {
    transactionNature: snapshot.currentDecision.bookkeepingNature === 'expense' ? 'expense' : null,
    businessPurpose: snapshot.currentDecision.businessPurpose ?? (snapshot.currentDecision.treatment === 'business'
      ? 'Established business operating expense.' : null),
    businessUseTreatment: snapshot.currentDecision.treatment === 'mixed_use' ? 'mixed'
      : snapshot.currentDecision.treatment,
    conflictingEvidence: snapshot.hasOpenConflictingEvidence,
  }
  const movementReason = expenseMovementReason(snapshot)
  if (movementReason) return { version: OPERATING_EXPENSE_CLASSIFIER_VERSION, status: 'special_treatment',
    categoryKey: null, expenseNature: null, confidence: 1, reasonCode: movementReason,
    evidence: ['amount_direction', 'financial_description'], taxFacts: baseFacts }
  for (const [pattern, status, reasonCode] of specialPatterns) {
    if (reasonCode === 'POSSIBLE_ASSET' && /\b(?:equipment rental|equipment lease|computer repair|laptop repair|equipment repair)\b/.test(source)
      && !/\b(?:purchase|purchased|bought)\b/.test(source)) continue
    if (pattern.test(source)) return { version: OPERATING_EXPENSE_CLASSIFIER_VERSION, status,
      categoryKey: null, expenseNature: null, confidence: 0.95, reasonCode,
      evidence: ['merchant_or_description'], taxFacts: baseFacts }
  }
  const providerMeal = snapshot.personalFinanceCategory?.primary === 'FOOD_AND_DRINK'
  const established = [...new Set(snapshot.currentDecision.allocations
    .filter(a => a.kind === 'business' && a.taxCategoryKey).map(a => a.taxCategoryKey))]
  if (!specificCorrection && (receiptMeal || providerMeal) && (established.some(key => key !== 'meals')
    || patterns.some(item => item.categoryKey !== 'meals' && item.pattern.test(source))))
    return { version: OPERATING_EXPENSE_CLASSIFIER_VERSION, status: 'needs_facts', categoryKey: null,
      expenseNature: null, confidence: 0, reasonCode: 'CONFLICTING_CATEGORY_EVIDENCE',
      evidence: ['established_category', 'meal_evidence'], taxFacts: baseFacts }
  if (!specificCorrection && (receiptMeal || providerMeal)) {
    return { version: OPERATING_EXPENSE_CLASSIFIER_VERSION, status: 'ordinary', categoryKey: 'meals',
      expenseNature: 'business_meal', confidence: receiptMeal ? 0.99 : 0.94, reasonCode: receiptMeal ? 'RECEIPT_MEAL_EVIDENCE' : 'PROVIDER_MEAL_EVIDENCE',
      evidence: [receiptMeal ? 'receipt_meal' : 'plaid_category', ...receiptEvidence.map(item => `receipt_extraction:${item.source.id}`)], taxFacts: { ...baseFacts, expenseNature: 'business_meal',
        mealBusinessContext: Boolean(supportedMealPurpose(snapshot)) } }
  }
  const matches = patterns.filter(({ pattern }) => pattern.test(source))
  if (!specificCorrection && snapshotEconomicContext(snapshot)?.context === 'telecom_service'
    && snapshotEconomicContext(snapshot)?.confidence === 'strong'
    && !matches.some(match => match.categoryKey === 'utilities'))
    matches.push(patterns.find(match => match.categoryKey === 'utilities')!)
  // A current allocation is stronger than failure to recognize its vocabulary.
  // Conflicting positive evidence still takes the needs-facts path below.
  if (established.length === 1) {
    const existing = patterns.find(p => p.categoryKey === established[0])
    if (existing && !matches.some(p => p.categoryKey === existing.categoryKey)) matches.push(existing)
  }
  const unique = [...new Set(matches.map(({ categoryKey }) => categoryKey))]
  if (unique.length !== 1) return { version: OPERATING_EXPENSE_CLASSIFIER_VERSION,
    status: unique.length ? 'needs_facts' : 'needs_facts', categoryKey: null, expenseNature: null,
    confidence: 0, reasonCode: unique.length ? 'CONFLICTING_CATEGORY_EVIDENCE' : 'CATEGORY_EVIDENCE_INSUFFICIENT',
    evidence: [], taxFacts: baseFacts }
  const match = matches[0]
  const taxFacts: TaxRuleFacts = { ...baseFacts, expenseNature: match.nature,
    capitalizableAsset: false, durableProperty: false, inventoryOrResale: false, prepaidMultiYear: false,
    supplyUseContext: match.categoryKey === 'supplies' ? 'operating_supply' : null,
    shippingCostContext: match.categoryKey === 'postage' ? 'standalone_business_delivery' : null,
    financialActivityType: match.categoryKey === 'fees' ? 'bank_service_fee' : null,
    governmentPaymentType: match.categoryKey === 'taxes-licenses' ? 'ordinary_current_business_license' : null,
    currentBusiness: match.categoryKey === 'taxes-licenses' ? true : null,
    travelAwayFromHome: match.categoryKey === 'travel'
      ? Boolean(snapshot.currentDecision.businessPurpose && snapshot.currentDecision.businessPurpose.trim().length >= 12)
      : undefined,
    mealBusinessContext: match.categoryKey === 'meals' ? Boolean(supportedMealPurpose(snapshot)) : undefined,
  }
  return { version: OPERATING_EXPENSE_CLASSIFIER_VERSION, status: 'ordinary',
    categoryKey: match.categoryKey, expenseNature: match.nature, confidence: 0.94,
    reasonCode: `STRONG_${match.categoryKey.toUpperCase()}_EVIDENCE`,
    evidence: specificCorrection ? ['customer_description'] : ['merchant_or_description',
      ...receiptEvidence.map(item => `receipt_extraction:${item.source.id}`),
      ...(snapshot.personalFinanceCategory ? ['plaid'] : []),
      ...(established.includes(match.categoryKey) ? ['established_category'] : [])], taxFacts }
}
