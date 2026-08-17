export const BOOKKEEPING_TREATMENTS = [
  'unresolved',
  'business',
  'personal',
  'mixed_use',
  'excluded',
] as const

export type BookkeepingTreatment = (typeof BOOKKEEPING_TREATMENTS)[number]

export const REVIEW_STATUSES = [
  'not_required',
  'needs_review',
  'in_review',
  'resolved',
] as const

export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

export const BOOKKEEPING_NATURES = [
  'expense',
  'business_income',
  'transfer',
  'credit_card_payment',
  'refund',
  'owner_contribution',
  'loan_proceeds',
  'other_non_income',
] as const

export type BookkeepingNature = (typeof BOOKKEEPING_NATURES)[number]

export const DECISION_PROVENANCE = [
  'automation',
  'user',
  'system',
  'import',
] as const

export type DecisionProvenance = (typeof DECISION_PROVENANCE)[number]

export type AllocationKind = 'business' | 'personal' | 'excluded'

export type CanonicalBookkeepingRecord = {
  id: string
  businessId: string
  authoritativeAmountCents: number | null
  authoritativeCurrency: string
}

export type FinancialSourceEvidence = {
  id: string
  businessId: string
  amountCents: number
  currency: string
  occurredOn: string
}

export type ResolvedFinancialTransactionRecord = {
  record: CanonicalBookkeepingRecord
  decision: StoredBookkeepingDecision
}

export type AutomatedDecisionBasis = {
  evidenceSufficient: boolean
  ruleKey: string | null
  ruleAllowed: boolean
  businessPurposeSupported: boolean
  mixedUseAllocationSupported: boolean
}

export type AutomatedDecisionProposal = Omit<
  BookkeepingDecisionInput,
  'provenance'
> & {
  basis: AutomatedDecisionBasis
}

export type CanonicalReviewQueueItem = {
  record: CanonicalBookkeepingRecord
  decision: StoredBookkeepingDecision
}

export type CanonicalRecordInput = {
  sourceKind: 'financial_transaction' | 'receipt' | 'manual'
  financialTransactionId: string | null
  ingestionKey: string
  amountCents: number | null
  currency: string
  occurredOn: string | null
}

export type BookkeepingAllocationInput = {
  kind: AllocationKind
  amountCents: number
  taxCategoryKey?: string | null
  memo?: string | null
}

export type BookkeepingDecisionInput = {
  bookkeepingNature: BookkeepingNature | null
  treatment: BookkeepingTreatment
  reviewStatus: ReviewStatus
  provenance: DecisionProvenance
  confidence?: number | null
  reason?: string | null
  businessPurpose?: string | null
  allocations: BookkeepingAllocationInput[]
}

export type StoredBookkeepingDecision = BookkeepingDecisionInput & {
  id: string
  businessId: string
  bookkeepingRecordId: string
  actorUserId: string | null
  supersedesDecisionId: string | null
  createdAt: string
}

export type DocumentationLink = {
  id: string
  businessId: string
  bookkeepingRecordId: string
  receiptId: string
  provenance: DecisionProvenance
  actorUserId: string | null
  linkedAt: string
  revokedAt: string | null
  revocationReason: string | null
}

export type BookkeepingActor = {
  businessId: string
  userId: string | null
  provenance: DecisionProvenance
}
