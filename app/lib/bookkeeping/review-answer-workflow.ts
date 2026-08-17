import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  BusinessPurposeAnswer,
  BusinessUseAnswer,
  MixedUseAmountAnswer,
} from './review-answer-model'
import {
  validateBusinessPurposeAnswer,
  validateBusinessUseAnswer,
  validateMixedUseAmountAnswer,
} from './review-answer-validation'
import { SupabaseBookkeepingRepository } from './supabase-repository'

export async function answerBusinessPurposeReviewIssue(input: {
  supabase: SupabaseClient
  reviewIssueId: string
  expectedCurrentEventId: string
  expectedCurrentDecisionId: string
  expectedContextFingerprint: string
  expectedEvidenceFingerprint: string
  answer: BusinessPurposeAnswer | unknown
}) {
  const {
    data: { user },
    error,
  } = await input.supabase.auth.getUser()
  if (error || !user) throw new Error('An authenticated user is required.')

  return new SupabaseBookkeepingRepository(input.supabase).answerBusinessPurpose({
    reviewIssueId: input.reviewIssueId,
    expectedCurrentEventId: input.expectedCurrentEventId,
    expectedCurrentDecisionId: input.expectedCurrentDecisionId,
    expectedContextFingerprint: input.expectedContextFingerprint,
    expectedEvidenceFingerprint: input.expectedEvidenceFingerprint,
    answer: validateBusinessPurposeAnswer(input.answer),
  })
}

type ReviewAnswerCommand<T> = {
  supabase: SupabaseClient
  reviewIssueId: string
  expectedCurrentEventId: string
  expectedCurrentDecisionId: string
  expectedContextFingerprint: string
  expectedEvidenceFingerprint: string
  answer: T | unknown
}

async function requireAuthenticatedUser(supabase: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('An authenticated user is required.')
}

export async function answerBusinessUseReviewIssue(
  input: ReviewAnswerCommand<BusinessUseAnswer>
) {
  await requireAuthenticatedUser(input.supabase)
  return new SupabaseBookkeepingRepository(input.supabase).answerBusinessUse({
    reviewIssueId: input.reviewIssueId,
    expectedCurrentEventId: input.expectedCurrentEventId,
    expectedCurrentDecisionId: input.expectedCurrentDecisionId,
    expectedContextFingerprint: input.expectedContextFingerprint,
    expectedEvidenceFingerprint: input.expectedEvidenceFingerprint,
    answer: validateBusinessUseAnswer(input.answer),
  })
}

export async function answerMixedUseReviewIssue(
  input: ReviewAnswerCommand<MixedUseAmountAnswer>
) {
  await requireAuthenticatedUser(input.supabase)
  return new SupabaseBookkeepingRepository(input.supabase).answerMixedUse({
    reviewIssueId: input.reviewIssueId,
    expectedCurrentEventId: input.expectedCurrentEventId,
    expectedCurrentDecisionId: input.expectedCurrentDecisionId,
    expectedContextFingerprint: input.expectedContextFingerprint,
    expectedEvidenceFingerprint: input.expectedEvidenceFingerprint,
    answer: validateMixedUseAmountAnswer(input.answer),
  })
}
