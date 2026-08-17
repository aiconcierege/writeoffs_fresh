import type {
  CanonicalWeeklyReviewItem,
  StoredWeeklyReviewEvent,
  WeeklyReviewReason,
} from './model'
import {
  validateDeferredUntil,
  validateMaterialContextFingerprint,
  validateReviewIssueIdentity,
} from './review-event-validation'
import { BookkeepingValidationError } from './validation'

export interface WeeklyReviewRepository {
  openReviewIssue(input: {
    businessId: string
    recordId: string
    decisionId: string
    reason: WeeklyReviewReason
    issueKey: string
    contextFingerprint: string
  }): Promise<StoredWeeklyReviewEvent>
  skipReviewIssue(input: {
    businessId: string
    userId: string
    issueId: string
    expectedCurrentEventId: string
    deferredUntil: string | null
  }): Promise<StoredWeeklyReviewEvent>
  resolveReviewIssue(input: {
    businessId: string
    issueId: string
    expectedCurrentEventId: string
  }): Promise<StoredWeeklyReviewEvent>
  reopenReviewIssue(input: {
    businessId: string
    issueId: string
    expectedCurrentEventId: string
    decisionId: string
    contextFingerprint: string
  }): Promise<StoredWeeklyReviewEvent>
  listCurrentWeeklyReviewItems(
    businessId: string,
    asOf: string
  ): Promise<CanonicalWeeklyReviewItem[]>
}

function required(value: string, label: string) {
  if (!value.trim()) throw new BookkeepingValidationError(`${label} is required.`)
  return value
}

export class CanonicalWeeklyReviewService {
  constructor(private readonly repository: WeeklyReviewRepository) {}

  async openIssue(input: {
    businessId: string
    recordId: string
    decisionId: string
    reason: string
    issueKey: string
    contextFingerprint: string
  }) {
    const identity = validateReviewIssueIdentity(input)
    return this.repository.openReviewIssue({
      businessId: required(input.businessId, 'Business'),
      recordId: required(input.recordId, 'Bookkeeping record'),
      decisionId: required(input.decisionId, 'Bookkeeping decision'),
      ...identity,
    })
  }

  async skipIssue(input: {
    businessId: string
    userId: string
    issueId: string
    expectedCurrentEventId: string
    deferredUntil: string | null
  }) {
    return this.repository.skipReviewIssue({
      businessId: required(input.businessId, 'Business'),
      userId: required(input.userId, 'Authenticated user'),
      issueId: required(input.issueId, 'Review issue'),
      expectedCurrentEventId: required(
        input.expectedCurrentEventId,
        'Current review event'
      ),
      deferredUntil: validateDeferredUntil(input.deferredUntil),
    })
  }

  async resolveIssue(input: {
    businessId: string
    issueId: string
    expectedCurrentEventId: string
  }) {
    return this.repository.resolveReviewIssue({
      businessId: required(input.businessId, 'Business'),
      issueId: required(input.issueId, 'Review issue'),
      expectedCurrentEventId: required(
        input.expectedCurrentEventId,
        'Current review event'
      ),
    })
  }

  async reopenIssue(input: {
    businessId: string
    issueId: string
    expectedCurrentEventId: string
    decisionId: string
    contextFingerprint: string
  }) {
    return this.repository.reopenReviewIssue({
      businessId: required(input.businessId, 'Business'),
      issueId: required(input.issueId, 'Review issue'),
      expectedCurrentEventId: required(
        input.expectedCurrentEventId,
        'Current review event'
      ),
      decisionId: required(input.decisionId, 'Bookkeeping decision'),
      contextFingerprint: validateMaterialContextFingerprint(
        input.contextFingerprint
      ),
    })
  }

  async listQueue(businessId: string, asOf = new Date().toISOString()) {
    required(businessId, 'Business')
    const normalizedAsOf = validateDeferredUntil(asOf)
    if (!normalizedAsOf) throw new BookkeepingValidationError('Queue time is required.')
    return this.repository.listCurrentWeeklyReviewItems(businessId, normalizedAsOf)
  }
}
