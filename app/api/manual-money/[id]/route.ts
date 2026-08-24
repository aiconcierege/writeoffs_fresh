import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { validateManualMoney } from '../../../lib/manual-money/validation'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Enter the corrected details.' }, { status: 400 }) }
  const parsed = validateManualMoney(body)
  const expected = typeof body.expectedEventId === 'string' ? body.expectedEventId : ''
  const requestKey = request.headers.get('idempotency-key') ?? ''
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (!expected || !/^[a-zA-Z0-9:_-]{1,120}$/.test(requestKey)) return NextResponse.json({ error: 'Reload this activity before correcting it.' }, { status: 409 })
  const value = parsed.value; const { id } = await params
  const { error } = await supabase.rpc('correct_manual_financial_activity', {
    p_manual_financial_source_id: id, p_expected_current_event_id: expected,
    p_amount_cents: value.amountCents, p_currency: value.currency, p_occurred_on: value.occurredOn,
    p_payment_method: value.paymentMethod, p_counterparty_name: value.counterpartyName,
    p_description: value.description, p_job_label: value.jobLabel, p_location: value.location,
    p_note: value.note, p_request_key: requestKey,
  })
  if (error) return NextResponse.json({ error: 'This activity changed or could not be corrected.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { body = {} }
  const expected = typeof body.expectedEventId === 'string' ? body.expectedEventId : ''
  const requestKey = request.headers.get('idempotency-key') ?? ''
  if (!expected || !/^[a-zA-Z0-9:_-]{1,120}$/.test(requestKey)) return NextResponse.json({ error: 'Reload this activity before removing it.' }, { status: 409 })
  const { id } = await params
  const { error } = await supabase.rpc('remove_manual_financial_activity', {
    p_manual_financial_source_id: id, p_expected_current_event_id: expected,
    p_request_key: requestKey, p_reason: 'Customer removed this activity from current records.',
  })
  if (error) return NextResponse.json({ error: 'Matched or changed activity could not be removed safely.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
