import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { validateMileageFacts } from '../../../lib/mileage/validation'
import { membershipErrorResponse, requireCapability } from '../../../lib/membership/entitlements'

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try { await requireCapability(supabase,'track_mileage') } catch(cause){const denied=membershipErrorResponse(cause);return NextResponse.json({error:denied.error},{status:denied.status})}
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid mileage details.' }, { status: 400 }) }
  const parsed = validateMileageFacts(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const requestKey = request.headers.get('idempotency-key')
  if (!requestKey || !/^[a-zA-Z0-9:_-]{1,120}$/.test(requestKey))
    return NextResponse.json({ error: 'A safe request identity is required.' }, { status: 400 })
  const value = parsed.value
  const { data, error } = await supabase.rpc('record_canonical_mileage', {
    p_id: crypto.randomUUID(), p_vehicle_id: value.vehicleId, p_miles_milli: value.milesMilli,
    p_occurred_on: value.occurredOn, p_job_label: value.jobLabel, p_destination: value.destination,
    p_business_purpose: value.businessPurpose, p_request_key: requestKey,
  })
  if (error) return NextResponse.json({ error: 'Mileage could not be saved.' }, { status: 400 })
  return NextResponse.json({ ok: true, id: data })
}
