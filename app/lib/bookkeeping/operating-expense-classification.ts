import type { BookkeepingEvaluationSnapshot } from './deterministic-evaluator'
import type { TaxRuleFacts } from './tax-rule-catalog'

export const OPERATING_EXPENSE_CLASSIFIER_VERSION = 'schedule-c-operating-expense:v1' as const

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

const patterns: Array<{ categoryKey: OperatingExpenseCategoryKey; nature: string; pattern: RegExp }> = [
  { categoryKey: 'car-truck', nature: 'vehicle_operating_expense', pattern: /\b(?:gasoline|vehicle fuel|auto insurance|car insurance|auto repair|car repair|oil change|vehicle maintenance|dmv registration|vehicle registration|car tires?|parking fee|road toll|vehicle lease payment|car lease payment)\b/ },
  { categoryKey: 'advertising', nature: 'advertising', pattern: /\b(?:advertis\w*|marketing|promotion|google ads|meta ads|facebook ads|mailchimp)\b/ },
  { categoryKey: 'commissions', nature: 'commissions_fees', pattern: /\b(?:commission|referral fee|broker fee|platform fee)\b/ },
  { categoryKey: 'contract-labor', nature: 'contract_labor', pattern: /\b(?:contractor|freelanc|subcontract|upwork|fiverr)\b/ },
  { categoryKey: 'insurance', nature: 'business_insurance', pattern: /\b(?:business insurance|liability insurance|professional liability|errors and omissions|e o insurance|commercial insurance)\b/ },
  { categoryKey: 'interest', nature: 'business_interest', pattern: /\b(?:interest charge|finance charge|business loan interest)\b/ },
  { categoryKey: 'legal-professional', nature: 'legal_professional', pattern: /\b(?:attorney|law firm|legal service|accountant|accounting|bookkeep|tax prepar|professional service)\b/ },
  { categoryKey: 'office-expense', nature: 'office_expense', pattern: /\b(?:office depot|office max|staples|printer ink|office expense)\b/ },
  { categoryKey: 'rent-other', nature: 'rent_other_business_property', pattern: /\b(?:office rent|studio rent|cowork|co work|wework|regus|equipment rental|equipment lease)\b/ },
  { categoryKey: 'repairs', nature: 'repairs_maintenance', pattern: /\b(?:repair|maintenance|handyman|janitorial|cleaning service|hvac service)\b/ },
  { categoryKey: 'supplies', nature: 'consumable_supplies', pattern: /\b(?:business supplies|shipping supplies|cleaning supplies)\b/ },
  { categoryKey: 'taxes-licenses', nature: 'taxes_licenses', pattern: /\b(?:business license|professional license|occupational license|permit fee|registration fee)\b/ },
  { categoryKey: 'travel', nature: 'business_travel', pattern: /\b(?:hotel|motel|lodging|airline|airfare|flight|business travel)\b/ },
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
  [/\b(?:equipment|machinery|computer|laptop|furniture|capital asset)\b/, 'special_treatment', 'POSSIBLE_ASSET'],
  [/\b(?:renovation|remodel|improvement|addition|restoration)\b/, 'special_treatment', 'POSSIBLE_CAPITAL_IMPROVEMENT'],
  [/\b(?:annual prepaid|multi year|multi-year|prepaid)\b/, 'special_treatment', 'POSSIBLE_PREPAYMENT'],
]

function plaidText(snapshot: BookkeepingEvaluationSnapshot) {
  return `${snapshot.personalFinanceCategory?.primary ?? ''} ${snapshot.personalFinanceCategory?.detailed ?? ''}`
    .toLowerCase().replace(/_/g, ' ')
}

export function classifyOperatingExpense(snapshot: BookkeepingEvaluationSnapshot): OperatingExpenseClassification {
  const source = normalize(`${snapshot.merchantName ?? ''} ${snapshot.description ?? ''} ${plaidText(snapshot)} ${snapshot.currentDecision.businessPurpose ?? ''}`)
  const baseFacts: TaxRuleFacts = {
    transactionNature: snapshot.currentDecision.bookkeepingNature === 'expense' ? 'expense' : null,
    businessPurpose: snapshot.currentDecision.businessPurpose ?? (snapshot.currentDecision.treatment === 'business'
      ? 'Established business operating expense.' : null),
    businessUseTreatment: snapshot.currentDecision.treatment === 'mixed_use' ? 'mixed'
      : snapshot.currentDecision.treatment,
    conflictingEvidence: snapshot.hasOpenConflictingEvidence,
  }
  for (const [pattern, status, reasonCode] of specialPatterns) {
    if (pattern.test(source)) return { version: OPERATING_EXPENSE_CLASSIFIER_VERSION, status,
      categoryKey: null, expenseNature: null, confidence: 0.95, reasonCode,
      evidence: ['merchant_or_description'], taxFacts: baseFacts }
  }
  if (snapshot.receiptMealSupported) {
    return { version: OPERATING_EXPENSE_CLASSIFIER_VERSION, status: 'ordinary', categoryKey: 'meals',
      expenseNature: 'business_meal', confidence: 0.99, reasonCode: 'RECEIPT_MEAL_EVIDENCE',
      evidence: ['receipt_meal'], taxFacts: { ...baseFacts, expenseNature: 'business_meal',
        mealBusinessContext: Boolean(snapshot.currentDecision.businessPurpose) } }
  }
  const matches = patterns.filter(({ pattern }) => pattern.test(source))
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
    mealBusinessContext: match.categoryKey === 'meals' ? Boolean(snapshot.currentDecision.businessPurpose) : undefined,
  }
  return { version: OPERATING_EXPENSE_CLASSIFIER_VERSION, status: 'ordinary',
    categoryKey: match.categoryKey, expenseNature: match.nature, confidence: 0.94,
    reasonCode: `STRONG_${match.categoryKey.toUpperCase()}_EVIDENCE`, evidence: ['merchant_or_description', 'plaid'], taxFacts }
}
