import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'

const TYPES = new Set(['phone_business_use_percentage','internet_business_use_percentage',
  'home_office_regular_use','home_office_exclusive_use','home_office_square_feet',
  'home_total_square_feet','equipment_business_use_percentage','equipment_placed_in_service_date'])

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Enter the requested fact.' }, { status: 400 }) }
  const factType = typeof body.factType === 'string' ? body.factType : ''
  const scopeKind = typeof body.scopeKind === 'string' ? body.scopeKind : ''
  const scopeKey = typeof body.scopeKey === 'string' ? body.scopeKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() : ''
  const expected = typeof body.expectedEventId === 'string' ? body.expectedEventId : null
  const requestKey = request.headers.get('idempotency-key') ?? ''
  if (!TYPES.has(factType) || !['business','merchant','bookkeeping_record'].includes(scopeKind)
    || !scopeKey || !/^[a-zA-Z0-9:_-]{1,120}$/.test(requestKey)
    || !['string','number','boolean'].includes(typeof body.value)) {
    return NextResponse.json({ error: 'Check the fact and try again.' }, { status: 400 })
  }
  const { data, error } = await supabase.rpc('record_deduction_business_fact', {
    p_fact_type: factType, p_scope_kind: scopeKind, p_scope_key: scopeKey,
    p_value: body.value, p_effective_on: new Date().toISOString().slice(0, 10),
    p_expected_current_event_id: expected, p_source: expected ? 'correction' : 'deduction_profile',
    p_reason: expected ? 'Customer corrected a reusable deduction fact.' : 'Customer supplied a reusable deduction fact.',
    p_request_key: requestKey,
  })
  if (error) return NextResponse.json({ error: /changed/i.test(error.message)
    ? 'This information changed. Reload and try again.' : 'That information could not be saved safely.' }, { status: 409 })
  return NextResponse.json({ ok: true, factEventId: data })
}
