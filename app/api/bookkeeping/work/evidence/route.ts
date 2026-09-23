import { isDeepStrictEqual } from 'node:util'
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../utils/supabase/server'
import { requestUser } from '../../../../lib/performance/request-identity'
import { timedRoute } from '../../../../lib/performance/request-timing'
import { guidedCommand } from '../../../../lib/bookkeeping/guided-command-response'
import { loadCurrentCustomerWork } from '../../../../lib/bookkeeping/customer-work'
import { requireCapability, membershipErrorResponse } from '../../../../lib/membership/entitlements'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
async function handlePOST(request: Request) {
  const db = await createServerSupabase(), { data: { user } } = await requestUser(db)
  if (!user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 })
  try { await requireCapability(db, 'autonomous_processing') } catch (e) {
    const r = membershipErrorResponse(e)
    return NextResponse.json({ error: r.error }, { status: r.status })
  }
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Check your response.' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || !uuid.test(body.requestId ?? '') || !['provided','none','later'].includes(body.response)
    || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100
    || !Array.isArray(body.documentIds) || body.documentIds.length > 10
    || body.documentIds.some((id: unknown) => typeof id !== 'string' || !uuid.test(id))
    || (body.response === 'provided') !== (body.documentIds.length > 0)) {
    return NextResponse.json({ error: 'Check your response.' }, { status: 400 })
  }
  try {
    const prior = await db.from('betti_guided_assertions').select('id').eq('id', body.requestId).maybeSingle()
    if (prior.error) throw new Error('Review unavailable')
    // Provided documents may already have resolved the former questions. SQL
    // checks owned immutable sources/documents without requiring obsolete decisions.
    if (!prior.data && body.response !== 'provided') {
      const work = await loadCurrentCustomerWork({ supabase: db })
      const action = work.actions.find(a => a.id === body.actionId && a.version === body.version && a.type === 'evidence_opportunity')
      if (!action?.items || !isDeepStrictEqual(action.items, body.items)) {
        return NextResponse.json({ error: 'I have updated information. Refresh before continuing.' }, { status: 409 })
      }
    }
    const result = await db.rpc('answer_betti_evidence_opportunity', {
      p_request: body.requestId, p_items: body.items, p_response: body.response, p_document_ids: body.documentIds,
    })
    if (result.error) return NextResponse.json({ error: 'I couldn’t confirm that response. Refresh before continuing.' }, { status: 409 })
    return NextResponse.json({ ok: true, result: result.data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'I couldn’t confirm that response. Please try again.' }, { status: 503 })
  }
}
export const POST = timedRoute(guidedCommand(handlePOST, { deferralField: 'response' }))
