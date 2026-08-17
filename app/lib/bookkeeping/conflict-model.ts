import type { BookkeepingDecisionInput, WeeklyReviewReason } from './model'

export const CONFLICT_OUTCOME_TYPES = [
  'COPY_CURRENT_DECISION',
  'COPY_PRIOR_DECISION',
  'APPLY_VALIDATED_CANDIDATE',
  'REMAIN_UNRESOLVED',
  'OPEN_TYPED_FOLLOWUP',
] as const

export type ConflictEvidenceReference = {
  kind:
    | 'bookkeeping_record'
    | 'bookkeeping_decision'
    | 'review_answer'
    | 'financial_transaction'
    | 'receipt'
    | 'document_link'
  id: string
  role: string
}

export type ConflictCandidate = Omit<BookkeepingDecisionInput, 'provenance'>

export type ConflictOption = {
  optionId: string
  factualMeaning: string
  evidenceRefs: ConflictEvidenceReference[]
  outcome:
    | { type: 'COPY_CURRENT_DECISION'; version: 1 }
    | { type: 'COPY_PRIOR_DECISION'; version: 1; decisionId: string }
    | { type: 'APPLY_VALIDATED_CANDIDATE'; version: 1; candidate: ConflictCandidate }
    | { type: 'REMAIN_UNRESOLVED'; version: 1 }
    | {
        type: 'OPEN_TYPED_FOLLOWUP'
        version: 1
        candidate: ConflictCandidate
        followUpReason: Exclude<WeeklyReviewReason, 'CONFLICTING_EVIDENCE'>
        followUpContext: Record<string, unknown>
      }
}

export type TrustedConflictQuestion = {
  businessId: string
  recordId: string
  decisionId: string
  conflictKey: string
  prompt: string
  allowNoneOfThese?: boolean
  options: ConflictOption[]
}
