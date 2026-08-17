import type { BusinessPurposeAnswer } from './review-answer-model'
import { BookkeepingValidationError } from './validation'

const ALLOWED_KEYS = new Set(['schemaVersion', 'businessPurpose'])

export function validateBusinessPurposeAnswer(
  value: unknown
): BusinessPurposeAnswer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BookkeepingValidationError('A factual business purpose is required.')
  }
  const input = value as Record<string, unknown>
  const keys = Object.keys(input)
  if (keys.length !== 2 || keys.some((key) => !ALLOWED_KEYS.has(key))) {
    throw new BookkeepingValidationError(
      'Only schemaVersion and businessPurpose are accepted.'
    )
  }
  if (input.schemaVersion !== 1) {
    throw new BookkeepingValidationError('Answer schema version is not supported.')
  }
  if (typeof input.businessPurpose !== 'string') {
    throw new BookkeepingValidationError('A factual business purpose is required.')
  }
  const businessPurpose = input.businessPurpose.trim()
  if (!businessPurpose) {
    throw new BookkeepingValidationError('A factual business purpose is required.')
  }
  if (businessPurpose.length > 1000) {
    throw new BookkeepingValidationError(
      'Business purpose must be 1,000 characters or fewer.'
    )
  }
  return { schemaVersion: 1, businessPurpose }
}
