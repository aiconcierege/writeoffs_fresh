import { NextResponse } from 'next/server'
import { getAuthenticatedContext, unauthorizedResponse } from '../../../lib/auth/require-user'
import { completePlaidUpdate, syncPlaidItem, syncPlaidItemsForCustomer } from '../../../lib/plaid/service'
import {membershipErrorResponse,requireCapability} from '../../../lib/membership/entitlements'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return unauthorizedResponse()
  try {
    await requireCapability(supabase,'autonomous_processing')
    const body = await request.json().catch(() => ({}))
    if (body.updatedItemId != null) {
      if (typeof body.updatedItemId !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
      await completePlaidUpdate({ supabase, itemRecordId: body.updatedItemId })
      const result = await syncPlaidItem(body.updatedItemId)
      return NextResponse.json({ updated: true, results: [result] }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const results = await syncPlaidItemsForCustomer({ supabase })
    return NextResponse.json({ updated: true, results }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const membership=membershipErrorResponse(error);if(membership.status!==503)return NextResponse.json({error:membership.error},{status:membership.status})
    return NextResponse.json({ error: 'update_failed', message: 'Accounts could not be updated right now.' }, { status: 502 })
  }
}
