import type {
  StoredBookkeepingDecision,
  StoredWeeklyReviewEvent,
} from './model'

export type BusinessPurposeAnswer = {
  schemaVersion: 1
  businessPurpose: string
}

export type StoredReviewAnswerResult = {
  answeredEvent: StoredWeeklyReviewEvent
  resolvedEvent: StoredWeeklyReviewEvent
  decision: StoredBookkeepingDecision
}
