import type { SupabaseClient } from '@supabase/supabase-js'
import type { BusinessPurposeAnswer } from './review-answer-model'
import { validateBusinessPurposeAnswer } from './review-answer-validation'
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
