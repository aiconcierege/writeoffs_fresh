import {
  DOCUMENTATION_REASONS,
  type DocumentationReason,
  type ReceiptLostAnswer,
} from './documentation-model'
import { BookkeepingValidationError } from './validation'

function required(value: string, label: string, maximum: number) {
  const trimmed = value.trim()
  if (!trimmed) throw new BookkeepingValidationError(`${label} is required.`)
  if (trimmed.length > maximum) {
    throw new BookkeepingValidationError(`${label} is too long.`)
  }
  return trimmed
}

export function validateDocumentationReason(
  value: string
): asserts value is DocumentationReason {
  if (!DOCUMENTATION_REASONS.includes(value as DocumentationReason)) {
    throw new BookkeepingValidationError(
      'Documentation request reason is not supported.'
    )
  }
}

export function validateDocumentationIssueIdentity(input: {
  reason: string
  issueKey: string
  contextFingerprint: string
}) {
  validateDocumentationReason(input.reason)
  return {
    reason: input.reason,
    issueKey: required(input.issueKey, 'Documentation issue key', 200),
    contextFingerprint: validateDocumentationContextFingerprint(
      input.contextFingerprint
    ),
  }
}

export function validateDocumentationContextFingerprint(value: string) {
  return required(value, 'Documentation context fingerprint', 200)
}

export function validateReceiptLostAnswer(value: unknown): ReceiptLostAnswer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BookkeepingValidationError('Receipt Lost assertion is required.')
  }
  const input = value as Record<string, unknown>
  const keys = Object.keys(input)
  if (
    keys.length !== 2 ||
    !keys.includes('schemaVersion') ||
    !keys.includes('assertion')
  ) {
    throw new BookkeepingValidationError(
      'Only schemaVersion and the Receipt Lost assertion are accepted.'
    )
  }
  if (input.schemaVersion !== 1 || input.assertion !== 'receipt_lost') {
    throw new BookkeepingValidationError(
      'The Receipt Lost assertion is not supported.'
    )
  }
  return { schemaVersion: 1, assertion: 'receipt_lost' }
}
