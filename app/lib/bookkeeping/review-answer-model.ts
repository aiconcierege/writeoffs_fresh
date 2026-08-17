import type {
  StoredBookkeepingDecision,
  StoredWeeklyReviewEvent,
} from './model'

export type BusinessPurposeAnswer = {
  schemaVersion: 1
  businessPurpose: string
}

export type BusinessUseAnswer = {
  schemaVersion: 1
  use: 'business' | 'personal' | 'mixed'
}

export type MixedUseAmountAnswer = {
  schemaVersion: 1
  businessAmountCents: number
}

export const TRANSACTION_ACTIVITIES = [
  'purchase',
  'earned_money',
  'moved_money',
  'paid_card',
  'received_refund',
  'added_own_money',
  'borrowed_money',
] as const

export type TransactionTypeAnswer =
  | {
      schemaVersion: 1
      activity: (typeof TRANSACTION_ACTIVITIES)[number]
    }
  | {
      schemaVersion: 1
      activity: 'other'
      details: string
    }

export type ConflictingEvidenceAnswer =
  | {
      schemaVersion: 1
      optionId: string
    }
  | {
      schemaVersion: 1
      optionId: 'none_of_these'
      factualExplanation: string
    }

export type StoredReviewAnswerResult = {
  answeredEvent: StoredWeeklyReviewEvent
  resolvedEvent: StoredWeeklyReviewEvent
  decision: StoredBookkeepingDecision
  followUpEvent: StoredWeeklyReviewEvent | null
}
