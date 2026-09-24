import { isDeepStrictEqual } from 'node:util'
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../utils/supabase/server'
import { requestUser } from '../../../../lib/performance/request-identity'
import { guidedCommand } from '../../../../lib/bookkeeping/guided-command-response'
import { loadCurrentCustomerWork } from '../../../../lib/bookkeeping/customer-work'
import { requireCapability, membershipErrorResponse } from '../../../../lib/membership/entitlements'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
async function handlePOST(request: Request) {
  const db = await createServerSupabase(), { data: { user } } = await requestUser(db)
  if (!user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 })
  try { await requireCapability(db, 'autonomous_processing') } catch (error) {
    const result = membershipErrorResponse(error)
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Check your response.' }, { status: 400 }) }
  if (!uuid.test(body?.requestId ?? '') || !['continue', 'none', 'later', 'uploaded', 'reviewed'].includes(body.response)
    || !body.journey || !['statements', 'receipts', 'personal', 'nonexpense'].includes(body.journey.stage)
    || !/^[a-f0-9]{64}$/.test(body.journey.scopeKey ?? '')
    || !/^\d{4}-\d{2}-\d{2}$/.test(body.journey.from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(body.journey.through ?? '')
    || !Array.isArray(body.items) || body.items.length > 20 || !Array.isArray(body.selectedIds)
    || body.selectedIds.length > 20 || !Array.isArray(body.documentIds) || body.documentIds.length > 10
    || [...body.selectedIds, ...body.documentIds].some(id => typeof id !== 'string' || !uuid.test(id))
    || (body.response === 'uploaded') !== (body.documentIds.length > 0)
    || body.response === 'uploaded' && (!['statements','receipts'].includes(body.journey.stage) || body.items.length > 0)
    || body.response !== 'reviewed' && body.selectedIds.length > 0) {
    return NextResponse.json({ error: 'Check your response.' }, { status: 400 })
  }
  try {
    const prior = await db.from('betti_catch_up_events').select('id').eq('id', body.requestId).maybeSingle()
    if (prior.error) throw new Error('History unavailable')
    if (!prior.data && body.response !== 'uploaded') {
      const work = await loadCurrentCustomerWork({ supabase: db })
      const action = work.actions.find(a => a.id === body.actionId && a.type === 'catch_up_journey')
      if (!action || action.version !== body.version
        || !isDeepStrictEqual(action.journey, body.journey) || !isDeepStrictEqual(action.items, body.items)) {
        return NextResponse.json({ error: 'I have updated information. Refresh before continuing.' }, { status: 409 })
      }
    }
    // Receipt of evidence is not a factual review. The upload may already have
    // made the rendered stage waiting or obsolete. SQL verifies owned documents,
    // fixed authorized scope and exact retry identity without inventing an answer.
    // Processing dependencies still fence the next substantive turn.
    const result = await db.rpc('answer_catch_up_stage', {
      p_request: body.requestId, p_scope_key: body.journey?.scopeKey,
      p_from: body.journey?.from, p_through: body.journey?.through,
      p_stage: body.journey?.stage, p_response: body.response,
      p_items: body.items, p_selected: body.selectedIds, p_documents: body.documentIds,
    })
    if (result.error) return NextResponse.json({ error: 'The records changed or are still being reviewed. Refresh before continuing.' }, { status: 409 })
    return NextResponse.json({ ok: true, result: result.data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'I couldn’t confirm that response. Please try again.' }, { status: 503 })
  }
}
export const POST = guidedCommand(handlePOST, { deferralField: 'response' })
