import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseCanonicalFinancialSummaryRepository } from './financial-summary-repository'
import { selectPotentialWriteoffs } from './potential-writeoffs'

export async function getAuthenticatedPotentialWriteoffs(input: {
  supabase: SupabaseClient
  periodStart: string
  periodEnd: string
}) {
  const { data: { user }, error } = await input.supabase.auth.getUser()
  if (error || !user) throw new Error('An authenticated user is required.')
  const repository = new SupabaseCanonicalFinancialSummaryRepository(input.supabase)
  const businessId = await repository.findBusinessIdForUser(user.id)
  if (!businessId) throw new Error('Business was not found for the authenticated user.')
  const { records } = await repository.loadRecords({ businessId,
    periodStart: input.periodStart, periodEnd: input.periodEnd })
  const items = selectPotentialWriteoffs({ records,
    periodStart: input.periodStart, periodEnd: input.periodEnd })
  return { count: items.length, items }
}
