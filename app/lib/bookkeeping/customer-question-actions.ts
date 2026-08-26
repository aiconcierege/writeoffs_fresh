import type { SupabaseClient } from '@supabase/supabase-js'
import { CanonicalWeeklyReviewService } from './review-events'
import {
  answerBusinessPurposeReviewIssue,
  answerBusinessUseReviewIssue,
  answerConflictingEvidenceReviewIssue,
} from './review-answer-workflow'
import { listCanonicalReviewQueue } from './review-queue'
import { projectCustomerQuestion } from './customer-questions'
import { SupabaseBookkeepingRepository } from './supabase-repository'

export type CustomerQuestionAction =
  | { action: 'defer' }
  | { action: 'not_sure' }
  | { action: 'business_use'; use: 'business' | 'personal' | 'mixed' }
  | { action: 'business_purpose'; businessPurpose: string }
  | { action: 'mixed_all_business' }
  | { action: 'mixed_personal_amount'; personalAmountCents: number }
  | { action: 'factual_choice'; optionId: string }
  | { action: 'deduction_fact'; value: string | number | boolean }

export async function actOnCustomerQuestion(input: {
  supabase: SupabaseClient
  issueId: string
  expectedEventId: string
  command: CustomerQuestionAction
}) {
  const { data: { user }, error } = await input.supabase.auth.getUser()
  if (error || !user) throw new Error('An authenticated user is required.')
  const queue = await listCanonicalReviewQueue({ supabase: input.supabase })
  const item = queue.find(({ event }) => event.reviewIssueId === input.issueId)
  if (!item || item.event.id !== input.expectedEventId) {
    throw new Error('This question changed. Please continue with the latest question.')
  }
  const projected = projectCustomerQuestion(item, {
    merchant: 'Transaction', amountCents: item.record.authoritativeAmountCents,
    currency: item.record.authoritativeCurrency, date: null,
  })
  if (!projected) throw new Error('This question is not currently available.')
  const repository = new SupabaseBookkeepingRepository(input.supabase)
  const businessId = item.event.businessId
  if (input.command.action === 'defer') {
    const deferredUntil = new Date(Date.now() + 7 * 86_400_000).toISOString()
    return new CanonicalWeeklyReviewService(repository).skipIssue({
      businessId, userId: user.id, issueId: input.issueId,
      expectedCurrentEventId: input.expectedEventId, deferredUntil,
    })
  }
  const common = {
    supabase: input.supabase,
    reviewIssueId: input.issueId,
    expectedCurrentEventId: input.expectedEventId,
    expectedCurrentDecisionId: item.decision.id,
    expectedContextFingerprint: item.event.contextFingerprint,
    expectedEvidenceFingerprint: item.event.evidenceFingerprint ?? '',
  }
  if (input.command.action === 'not_sure' && projected.kind !== 'factual_choice') {
    return repository.answerCustomerNotSure({
      reviewIssueId: input.issueId,
      expectedCurrentEventId: input.expectedEventId,
      expectedCurrentDecisionId: item.decision.id,
      expectedContextFingerprint: item.event.contextFingerprint,
      expectedEvidenceFingerprint: item.event.evidenceFingerprint ?? '',
    })
  }
  if (input.command.action === 'business_use' && item.event.reason === 'BUSINESS_USE_UNCLEAR') {
    return answerBusinessUseReviewIssue({ ...common,
      answer: { schemaVersion: 1, use: input.command.use },
    })
  }
  if (input.command.action === 'business_purpose' && item.event.reason === 'BUSINESS_PURPOSE_NEEDED') {
    return answerBusinessPurposeReviewIssue({ ...common,
      answer: { schemaVersion: 1, businessPurpose: input.command.businessPurpose },
    })
  }
  if (input.command.action === 'mixed_all_business' && item.event.reason === 'MIXED_USE_CLARIFICATION') {
    return repository.answerMixedUseAllBusiness({
      reviewIssueId: input.issueId,
      expectedCurrentEventId: input.expectedEventId,
      expectedCurrentDecisionId: item.decision.id,
      expectedContextFingerprint: item.event.contextFingerprint,
      expectedEvidenceFingerprint: item.event.evidenceFingerprint ?? '',
    })
  }
  if (input.command.action === 'mixed_personal_amount' && item.event.reason === 'MIXED_USE_CLARIFICATION') {
    return repository.answerMixedUsePersonalAmount({
      reviewIssueId: input.issueId,
      expectedCurrentEventId: input.expectedEventId,
      expectedCurrentDecisionId: item.decision.id,
      expectedContextFingerprint: item.event.contextFingerprint,
      expectedEvidenceFingerprint: item.event.evidenceFingerprint ?? '',
      personalAmountCents: input.command.personalAmountCents,
    })
  }
  if (input.command.action === 'factual_choice' && item.event.reason === 'CONFLICTING_EVIDENCE') {
    const conflictFingerprint = item.event.questionContext?.conflictFingerprint
    if (typeof conflictFingerprint !== 'string') throw new Error('This question needs to be refreshed.')
    return answerConflictingEvidenceReviewIssue({ ...common,
      expectedConflictFingerprint: conflictFingerprint,
      answer: { schemaVersion: 1, optionId: input.command.optionId },
    })
  }
  throw new Error('That answer does not match this question.')
}
