import { NextResponse } from 'next/server'
import { getAuthenticatedContext, unauthorizedResponse } from '../../../lib/auth/require-user'
import { syncPlaidItemsForCustomer } from '../../../lib/plaid/service'
import {membershipErrorResponse,requireCapability} from '../../../lib/membership/entitlements'

export const runtime = 'nodejs'

export async function POST() {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return unauthorizedResponse()
  try {
    await requireCapability(supabase,'autonomous_processing')
    const results = await syncPlaidItemsForCustomer({ supabase })
    return NextResponse.json({ updated: true, results }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const membership=membershipErrorResponse(error);if(membership.status!==503)return NextResponse.json({error:membership.error},{status:membership.status})
    return NextResponse.json({ error: 'update_failed', message: 'Accounts could not be updated right now.' }, { status: 502 })
  }
}
