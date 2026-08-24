import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../utils/supabase/server'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { body = {} }
  const expected = typeof body.expectedEventId === 'string' ? body.expectedEventId : ''
  const financialId = typeof body.financialTransactionId === 'string' ? body.financialTransactionId : ''
  const requestKey = request.headers.get('idempotency-key') ?? ''
  if (!expected || !financialId || !/^[a-zA-Z0-9:_-]{1,120}$/.test(requestKey)) return NextResponse.json({ error: 'Reload before matching this activity.' }, { status: 409 })
  const { id } = await params
  const { error } = await supabase.rpc('match_manual_financial_activity_to_bank_transaction', {
    p_manual_financial_source_id: id, p_expected_current_event_id: expected,
    p_financial_transaction_id: financialId, p_request_key: requestKey,
  })
  if (error) return NextResponse.json({ error: 'This activity could not be matched safely.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
