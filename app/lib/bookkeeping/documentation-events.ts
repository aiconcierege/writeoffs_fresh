import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  DocumentationReason,
  ReceiptLostAnswer,
  ReceiptLostResult,
  StoredDocumentationEvent,
} from './documentation-model'
import {
  validateDocumentationIssueIdentity,
  validateDocumentationContextFingerprint,
  validateDocumentationRequestContext,
  validateReceiptLostAnswer,
} from './documentation-validation'
import { BookkeepingValidationError } from './validation'
import { SupabaseBookkeepingRepository } from './supabase-repository'

export interface DocumentationRepository {
  openDocumentationRequest(input: {
    businessId: string
    recordId: string
    reason: DocumentationReason
    issueKey: string
    contextFingerprint: string
    questionContext: Record<string, unknown>
  }): Promise<StoredDocumentationEvent>
  markReceiptLost(input: {
    issueId: string
    expectedCurrentEventId: string
    expectedContextFingerprint: string
    expectedEvidenceFingerprint: string
    answer: ReceiptLostAnswer
  }): Promise<ReceiptLostResult>
  reopenDocumentationRequest(input: {
    businessId: string
    issueId: string
    expectedCurrentEventId: string
    contextFingerprint: string
    questionContext: Record<string, unknown>
  }): Promise<StoredDocumentationEvent>
  listOutstandingDocumentationRequests(
    businessId: string
  ): Promise<StoredDocumentationEvent[]>
}

function required(value: string, label: string) {
  if (!value.trim()) throw new BookkeepingValidationError(`${label} is required.`)
  return value
}

export class CanonicalDocumentationService {
  constructor(private readonly repository: DocumentationRepository) {}

  openRequest(input: {
    businessId: string
    recordId: string
    reason: string
    issueKey: string
    contextFingerprint: string
    questionContext: Record<string, unknown>
  }) {
    const identity = validateDocumentationIssueIdentity(input)
    return this.repository.openDocumentationRequest({
      businessId: required(input.businessId, 'Business'),
      recordId: required(input.recordId, 'Bookkeeping record'),
      questionContext: validateDocumentationRequestContext(
        input.questionContext
      ),
      ...identity,
    })
  }

  reopenRequest(input: {
    businessId: string
    issueId: string
    expectedCurrentEventId: string
    contextFingerprint: string
    questionContext: Record<string, unknown>
  }) {
    return this.repository.reopenDocumentationRequest({
      businessId: required(input.businessId, 'Business'),
      issueId: required(input.issueId, 'Documentation issue'),
      expectedCurrentEventId: required(
        input.expectedCurrentEventId,
        'Current documentation event'
      ),
      contextFingerprint: validateDocumentationContextFingerprint(
        input.contextFingerprint
      ),
      questionContext: input.questionContext,
    })
  }

  listOutstanding(businessId: string) {
    return this.repository.listOutstandingDocumentationRequests(
      required(businessId, 'Business')
    )
  }
}

export async function markReceiptLost(input: {
  supabase: SupabaseClient
  issueId: string
  expectedCurrentEventId: string
  expectedContextFingerprint: string
  expectedEvidenceFingerprint: string
  answer: ReceiptLostAnswer | unknown
}) {
  const {
    data: { user },
    error,
  } = await input.supabase.auth.getUser()
  if (error || !user) throw new Error('An authenticated user is required.')
  return new SupabaseBookkeepingRepository(input.supabase).markReceiptLost({
    issueId: required(input.issueId, 'Documentation issue'),
    expectedCurrentEventId: required(
      input.expectedCurrentEventId,
      'Current documentation event'
    ),
    expectedContextFingerprint: required(
      input.expectedContextFingerprint,
      'Documentation context fingerprint'
    ),
    expectedEvidenceFingerprint: required(
      input.expectedEvidenceFingerprint,
      'Documentation evidence fingerprint'
    ),
    answer: validateReceiptLostAnswer(input.answer),
  })
}
