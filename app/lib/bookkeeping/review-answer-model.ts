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

export type StoredReviewAnswerResult = {
  answeredEvent: StoredWeeklyReviewEvent
  resolvedEvent: StoredWeeklyReviewEvent
  decision: StoredBookkeepingDecision
  followUpEvent: StoredWeeklyReviewEvent | null
}
