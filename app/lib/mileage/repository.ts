import type { SupabaseClient } from '@supabase/supabase-js'

export async function requireMileageBusiness(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('AUTH_REQUIRED')
  const { data, error } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  if (error || !data) throw new Error('BUSINESS_UNAVAILABLE')
  return { user, businessId: data.id as string }
}

export async function listMileageContext(supabase: SupabaseClient, input: { start?: string; end?: string } = {}) {
  const { businessId } = await requireMileageBusiness(supabase)
  let entriesQuery = supabase.from('current_canonical_mileage_entries')
    .select('id,current_event_id,miles_milli,occurred_on,vehicle_id,job_label,destination,business_purpose,last_changed_at')
    .eq('business_id', businessId).order('occurred_on', { ascending: false })
  if (input.start) entriesQuery = entriesQuery.gte('occurred_on', input.start)
  if (input.end) entriesQuery = entriesQuery.lte('occurred_on', input.end)
  const [vehiclesResult, entriesResult] = await Promise.all([
    supabase.from('business_vehicles').select('id,display_name,vehicle_year,make,model,is_mixed_use,archived_at')
      .eq('business_id', businessId).order('created_at'),
    entriesQuery,
  ])
  if (vehiclesResult.error || entriesResult.error) throw new Error('MILEAGE_UNAVAILABLE')
  return { businessId, vehicles: vehiclesResult.data ?? [], entries: entriesResult.data ?? [] }
}

export async function loadMileageTotal(supabase: SupabaseClient, input: { businessId: string; start: string; end: string }) {
  const { data, error } = await supabase.from('current_canonical_mileage_entries').select('miles_milli')
    .eq('business_id', input.businessId).gte('occurred_on', input.start).lte('occurred_on', input.end)
  if (error) throw new Error(`Unable to load mileage totals: ${error.message}`)
  return (data ?? []).reduce((sum, row) => {
    const value = Number(row.miles_milli); const next = sum + value
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(next)) throw new Error('Mileage total exceeds exact numeric range.')
    return next
  }, 0)
}
