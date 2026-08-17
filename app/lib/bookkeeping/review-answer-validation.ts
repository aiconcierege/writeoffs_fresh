import type {
  BusinessPurposeAnswer,
  BusinessUseAnswer,
  MixedUseAmountAnswer,
  TransactionTypeAnswer,
  ConflictingEvidenceAnswer,
} from './review-answer-model'
import { TRANSACTION_ACTIVITIES } from './review-answer-model'
import { BookkeepingValidationError } from './validation'

const ALLOWED_KEYS = new Set(['schemaVersion', 'businessPurpose'])
const BUSINESS_USE_KEYS = new Set(['schemaVersion', 'use'])
const MIXED_USE_KEYS = new Set(['schemaVersion', 'businessAmountCents'])
const TRANSACTION_TYPE_KEYS = new Set(['schemaVersion', 'activity'])
const OTHER_TRANSACTION_TYPE_KEYS = new Set([
  'schemaVersion',
  'activity',
  'details',
])
const CONFLICT_KEYS = new Set(['schemaVersion', 'optionId'])
const CONFLICT_FALLBACK_KEYS = new Set([
  'schemaVersion',
  'optionId',
  'factualExplanation',
])

function requireExactKeys(
  input: Record<string, unknown>,
  allowed: Set<string>,
  message: string
) {
  const keys = Object.keys(input)
  if (keys.length !== allowed.size || keys.some((key) => !allowed.has(key))) {
    throw new BookkeepingValidationError(message)
  }
}

export function validateBusinessPurposeAnswer(
  value: unknown
): BusinessPurposeAnswer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BookkeepingValidationError('A factual business purpose is required.')
  }
  const input = value as Record<string, unknown>
  requireExactKeys(
    input,
    ALLOWED_KEYS,
    'Only schemaVersion and businessPurpose are accepted.'
  )
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

export function validateBusinessUseAnswer(value: unknown): BusinessUseAnswer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BookkeepingValidationError('A business-use answer is required.')
  }
  const input = value as Record<string, unknown>
  requireExactKeys(
    input,
    BUSINESS_USE_KEYS,
    'Only schemaVersion and use are accepted.'
  )
  if (input.schemaVersion !== 1) {
    throw new BookkeepingValidationError('Answer schema version is not supported.')
  }
  if (!['business', 'personal', 'mixed'].includes(String(input.use))) {
    throw new BookkeepingValidationError(
      'Use must be business, personal, or mixed.'
    )
  }
  return { schemaVersion: 1, use: input.use as BusinessUseAnswer['use'] }
}

export function validateMixedUseAmountAnswer(
  value: unknown
): MixedUseAmountAnswer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BookkeepingValidationError('A business amount is required.')
  }
  const input = value as Record<string, unknown>
  requireExactKeys(
    input,
    MIXED_USE_KEYS,
    'Only schemaVersion and businessAmountCents are accepted.'
  )
  if (input.schemaVersion !== 1) {
    throw new BookkeepingValidationError('Answer schema version is not supported.')
  }
  if (
    typeof input.businessAmountCents !== 'number' ||
    !Number.isSafeInteger(input.businessAmountCents) ||
    input.businessAmountCents <= 0
  ) {
    throw new BookkeepingValidationError(
      'Business amount must be a positive whole number of cents.'
    )
  }
  return {
    schemaVersion: 1,
    businessAmountCents: input.businessAmountCents,
  }
}

export function validateTransactionTypeAnswer(
  value: unknown
): TransactionTypeAnswer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BookkeepingValidationError('A factual transaction answer is required.')
  }
  const input = value as Record<string, unknown>
  if (input.schemaVersion !== 1) {
    throw new BookkeepingValidationError('Answer schema version is not supported.')
  }
  if (input.activity === 'other') {
    requireExactKeys(
      input,
      OTHER_TRANSACTION_TYPE_KEYS,
      'Only schemaVersion, activity, and factual details are accepted for other.'
    )
    if (typeof input.details !== 'string') {
      throw new BookkeepingValidationError('Factual details are required for other.')
    }
    const details = input.details.trim()
    if (!details) {
      throw new BookkeepingValidationError('Factual details are required for other.')
    }
    if (details.length > 1000) {
      throw new BookkeepingValidationError(
        'Transaction details must be 1,000 characters or fewer.'
      )
    }
    return { schemaVersion: 1, activity: 'other', details }
  }
  requireExactKeys(
    input,
    TRANSACTION_TYPE_KEYS,
    'Only schemaVersion and activity are accepted.'
  )
  if (!TRANSACTION_ACTIVITIES.includes(
    input.activity as (typeof TRANSACTION_ACTIVITIES)[number]
  )) {
    throw new BookkeepingValidationError('Transaction activity is not supported.')
  }
  return {
    schemaVersion: 1,
    activity: input.activity as (typeof TRANSACTION_ACTIVITIES)[number],
  }
}

export function validateConflictingEvidenceAnswer(
  value: unknown
): ConflictingEvidenceAnswer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BookkeepingValidationError('A factual option is required.')
  }
  const input = value as Record<string, unknown>
  if (input.schemaVersion !== 1 || typeof input.optionId !== 'string') {
    throw new BookkeepingValidationError(
      'Answer schema version and factual option are required.'
    )
  }
  const optionId = input.optionId.trim()
  if (!optionId || optionId.length > 120) {
    throw new BookkeepingValidationError('Factual option is invalid.')
  }
  if (optionId === 'none_of_these') {
    requireExactKeys(
      input,
      CONFLICT_FALLBACK_KEYS,
      'The fallback accepts only schemaVersion, optionId, and factualExplanation.'
    )
    if (typeof input.factualExplanation !== 'string') {
      throw new BookkeepingValidationError('A factual explanation is required.')
    }
    const factualExplanation = input.factualExplanation.trim()
    if (!factualExplanation || factualExplanation.length > 1000) {
      throw new BookkeepingValidationError(
        'Factual explanation must be between 1 and 1,000 characters.'
      )
    }
    return { schemaVersion: 1, optionId, factualExplanation }
  }
  requireExactKeys(
    input,
    CONFLICT_KEYS,
    'Only schemaVersion and optionId are accepted.'
  )
  return { schemaVersion: 1, optionId }
}
