import type { SupabaseClient } from '@supabase/supabase-js'
import type { TrustedConflictQuestion } from './conflict-model'
import { SupabaseBookkeepingRepository } from './supabase-repository'

/** Trusted processing only. The database independently validates every option. */
export async function openConflictingEvidenceIssue(input: {
  supabase: SupabaseClient
  question: TrustedConflictQuestion
}) {
  return new SupabaseBookkeepingRepository(
    input.supabase
  ).openConflictingEvidence(input.question)
}
