import {requestUser} from '../performance/request-identity'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CanonicalWeeklyReviewService } from './review-events'
import { SupabaseBookkeepingRepository } from './supabase-repository'
import { loadCurrentRecordConvergences } from './current-record-resolution'

export async function listCanonicalReviewQueue(input: {
  supabase: SupabaseClient
  businessId?: string
  issueId?: string
  asOf?: string
  resolution?:ReturnType<typeof loadCurrentRecordConvergences>
}) {
  const repository = new SupabaseBookkeepingRepository(input.supabase)
  let businessId=input.businessId
  if(!businessId){
    const {data:{user},error}=await requestUser(input.supabase)
    if(error||!user)throw new Error('An authenticated user is required.')
    businessId=(await repository.findBusinessIdForUser(user.id))??undefined
  }
  if (!businessId) throw new Error('Business was not found for the authenticated user.')
  const [queue, resolution] = await Promise.all([
    new CanonicalWeeklyReviewService(repository).listQueue(businessId,input.asOf,input.issueId),
    input.resolution??loadCurrentRecordConvergences({ supabase: input.supabase, businessId }),
  ])
  return queue.filter(({ record }) => !resolution.isAbsorbed(record.id) && !resolution.isInactive(record.id))
}
