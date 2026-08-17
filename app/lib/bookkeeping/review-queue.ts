import type { SupabaseClient } from '@supabase/supabase-js'
import { CanonicalBookkeepingService } from './service'
import { SupabaseBookkeepingRepository } from './supabase-repository'

export async function listCanonicalReviewQueue(input: {
  supabase: SupabaseClient
}) {
  const {
    data: { user },
    error,
  } = await input.supabase.auth.getUser()
  if (error || !user) throw new Error('An authenticated user is required.')

  return new CanonicalBookkeepingService(
    new SupabaseBookkeepingRepository(input.supabase)
  ).listReviewQueueForUser(user.id)
}
