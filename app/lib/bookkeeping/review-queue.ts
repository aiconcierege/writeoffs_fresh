import type { SupabaseClient } from '@supabase/supabase-js'
import { CanonicalWeeklyReviewService } from './review-events'
import { SupabaseBookkeepingRepository } from './supabase-repository'

export async function listCanonicalReviewQueue(input: {
  supabase: SupabaseClient
}) {
  const {
    data: { user },
    error,
  } = await input.supabase.auth.getUser()
  if (error || !user) throw new Error('An authenticated user is required.')

  const repository = new SupabaseBookkeepingRepository(input.supabase)
  const businessId = await repository.findBusinessIdForUser(user.id)
  if (!businessId) throw new Error('Business was not found for the authenticated user.')
  return new CanonicalWeeklyReviewService(repository).listQueue(businessId)
}
