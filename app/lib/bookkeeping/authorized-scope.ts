import type { SupabaseClient } from '@supabase/supabase-js'

/** Commercial coverage permits dates; the customer's selected start activates them.
 * Neither a document date nor a provider's available history grants scope. */
export type AuthorizedBookkeepingScope = {
  businessId: string
  selectedStart: string | null
  authorizedStart: string | null
  includedStart: string | null
  activation: string | null
  historicalAuthorized: boolean
  currentFrom: string | null
  catchUp: { from: string; through: string } | null
}
export async function loadAuthorizedScope(db: SupabaseClient, businessId: string): Promise<AuthorizedBookkeepingScope> {
  const { data, error } = await db.rpc('read_authorized_bookkeeping_scope', { p_business_id: businessId })
  if (error || !data || data.businessId !== businessId) throw new Error('Authorized bookkeeping scope unavailable')
  return data as AuthorizedBookkeepingScope
}
export function activityIsActive(date: string | null | undefined, scope: Pick<AuthorizedBookkeepingScope,'authorizedStart'>) {
  return Boolean(date && scope.authorizedStart && date >= scope.authorizedStart)
}
