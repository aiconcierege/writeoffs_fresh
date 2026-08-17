import {
  WEEKLY_REVIEW_REASONS,
  type WeeklyReviewReason,
} from './model'
import { BookkeepingValidationError } from './validation'

function requireNonEmpty(value: string, label: string, maxLength: number) {
  const trimmed = value.trim()
  if (!trimmed) throw new BookkeepingValidationError(`${label} is required.`)
  if (trimmed.length > maxLength) {
    throw new BookkeepingValidationError(`${label} is too long.`)
  }
  return trimmed
}

export function validateWeeklyReviewReason(
  reason: string
): asserts reason is WeeklyReviewReason {
  if (!WEEKLY_REVIEW_REASONS.includes(reason as WeeklyReviewReason)) {
    throw new BookkeepingValidationError('Weekly Review reason is not supported.')
  }
}

export function validateReviewIssueIdentity(input: {
  reason: string
  issueKey: string
  contextFingerprint: string
}) {
  validateWeeklyReviewReason(input.reason)
  return {
    reason: input.reason,
    issueKey: requireNonEmpty(input.issueKey, 'Review issue key', 200),
    contextFingerprint: validateMaterialContextFingerprint(
      input.contextFingerprint
    ),
  }
}

export function validateMaterialContextFingerprint(value: string) {
  return requireNonEmpty(value, 'Material context fingerprint', 200)
}

export function validateDeferredUntil(value: string | null) {
  if (value === null) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new BookkeepingValidationError('Deferred-until value is invalid.')
  }
  return parsed.toISOString()
}
