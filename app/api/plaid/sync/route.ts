import { hasPlaidMfa } from '../../../lib/plaid/mfa'
import { after, NextResponse } from 'next/server'
import { getAuthenticatedContext, unauthorizedResponse } from '../../../lib/auth/require-user'
import { completePlaidUpdate, syncPlaidItemsForCustomer } from '../../../lib/plaid/service'
import {membershipErrorResponse,requireCapability} from '../../../lib/membership/entitlements'

import { processPlaidWebhookSync } from '../../../lib/plaid/webhooks'

export const maxDuration = 60
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return unauthorizedResponse()
  if (!await hasPlaidMfa(supabase)) return NextResponse.json({ error: 'verification_required', message: 'Verify your identity to manage your bank connection.' }, { status: 403 })
  try {
    await requireCapability(supabase,'autonomous_processing')
    const body = await request.json().catch(() => ({}))
    if (body.updatedItemId != null) {
      if (typeof body.updatedItemId !== 'string' || !Number.isSafeInteger(body.updateVersion) || body.updateVersion < 0) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
      await completePlaidUpdate({ supabase, itemRecordId: body.updatedItemId, expectedVersion: body.updateVersion })
      after(() => processPlaidWebhookSync(body.updatedItemId))
      return NextResponse.json({ updated: true, syncPending: true }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const results = await syncPlaidItemsForCustomer({ supabase })
    return NextResponse.json({ updated: true, results }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof Error && error.message === 'ITEM_UPDATE_CHANGED') return NextResponse.json({ error: 'connection_changed', message: 'Your bank sent a new update. Please review this connection again.' }, { status: 409 })
    const membership=membershipErrorResponse(error);if(membership.status!==503)return NextResponse.json({error:membership.error},{status:membership.status})
    return NextResponse.json({ error: 'update_failed', message: 'Accounts could not be updated right now.' }, { status: 502 })
  }
}
