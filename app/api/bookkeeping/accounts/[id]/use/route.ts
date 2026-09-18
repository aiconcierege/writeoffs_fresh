import {requestUser} from '../../../../../lib/performance/request-identity'
import {guidedCommand} from '../../../../../lib/bookkeeping/guided-command-response'
import { timedRoute } from '../../../../../lib/performance/request-timing'
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../../utils/supabase/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function handlePOST(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await requestUser(supabase)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await context.params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!UUID.test(id) || !body || !['business_only', 'business_and_personal'].includes(String(body.designation))
    || typeof body.effectiveAt !== 'string' || !Number.isFinite(Date.parse(body.effectiveAt))
    || typeof body.requestId !== 'string' || !UUID.test(body.requestId)) {
    return NextResponse.json({ error: 'invalid account use request' }, { status: 400 })
  }
  const { data, error } = await supabase.rpc('set_financial_account_use', {
    p_financial_account_id: id, p_designation: body.designation,
    p_effective_at: body.effectiveAt, p_request_id: body.requestId,
  })
  if (error) {
    console.warn('Account-use save rejected', { requestId: body.requestId, code: error.code ?? 'unknown' })
    return NextResponse.json({ error: 'The account use could not be saved.' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, eventId: data })
}

export const POST = timedRoute(guidedCommand(handlePOST))
