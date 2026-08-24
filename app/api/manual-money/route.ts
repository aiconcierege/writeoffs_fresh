import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../utils/supabase/server'
import { validateManualMoney } from '../../lib/manual-money/validation'

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Enter the activity details.' }, { status: 400 }) }
  const parsed = validateManualMoney(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const requestKey = request.headers.get('idempotency-key')
  if (!requestKey || !/^[a-zA-Z0-9:_-]{1,120}$/.test(requestKey)) return NextResponse.json({ error: 'A safe request identity is required.' }, { status: 400 })
  const value = parsed.value
  const { data, error } = await supabase.rpc('record_manual_financial_activity', {
    p_direction: value.direction, p_amount_cents: value.amountCents, p_currency: value.currency,
    p_occurred_on: value.occurredOn, p_payment_method: value.paymentMethod,
    p_counterparty_name: value.counterpartyName, p_description: value.description,
    p_job_label: value.jobLabel, p_location: value.location, p_note: value.note,
    p_request_key: requestKey,
  })
  if (error) return NextResponse.json({ error: 'This activity could not be saved.' }, { status: 400 })
  return NextResponse.json({ ok: true, id: data })
}
