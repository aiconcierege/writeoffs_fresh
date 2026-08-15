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
  amountCents: number | null
  currency: string
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
