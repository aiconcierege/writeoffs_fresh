import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { validateMileageFacts } from '../../../lib/mileage/validation'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const parsed = validateMileageFacts(body && { vehicleId:body.vehicleId,miles:body.miles,occurredOn:body.occurredOn,
    jobLabel:body.jobLabel,destination:body.destination,businessPurpose:body.businessPurpose })
  const expectedEventId = body?.expectedEventId
  const requestKey = request.headers.get('idempotency-key')
  if (!parsed.ok || typeof expectedEventId !== 'string' || !requestKey)
    return NextResponse.json({ error: parsed.ok ? 'Reload this trip before editing.' : parsed.error }, { status: 400 })
  const { id } = await context.params; const value = parsed.value
  const { data, error } = await supabase.rpc('correct_canonical_mileage', {
    p_mileage_entry_id: id,p_expected_event_id: expectedEventId,p_vehicle_id: value.vehicleId,
    p_miles_milli: value.milesMilli,p_occurred_on: value.occurredOn,p_job_label: value.jobLabel,
    p_destination: value.destination,p_business_purpose: value.businessPurpose,p_request_key: requestKey,
    p_reason: 'Customer corrected trip facts.',
  })
  return error ? NextResponse.json({ error: 'Mileage could not be updated.' }, { status: 409 }) : NextResponse.json({ ok: true, eventId: data })
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const requestKey = request.headers.get('idempotency-key'); const expected = body?.expectedEventId
  if (!requestKey || typeof expected !== 'string') return NextResponse.json({ error: 'Reload this trip before removing.' }, { status: 400 })
  const { id } = await context.params
  const { data, error } = await supabase.rpc('void_canonical_mileage', { p_mileage_entry_id:id,
    p_expected_event_id:expected,p_request_key:requestKey,p_reason:'Customer removed trip from current mileage.' })
  return error ? NextResponse.json({ error: 'Mileage could not be removed.' }, { status: 409 }) : NextResponse.json({ ok:true,eventId:data })
}
