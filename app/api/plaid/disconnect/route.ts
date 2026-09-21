import { hasPlaidMfa } from '../../../lib/plaid/mfa'
import { NextResponse } from 'next/server'
import { getAuthenticatedContext, unauthorizedResponse } from '../../../lib/auth/require-user'
import { disconnectPlaidItem } from '../../../lib/plaid/service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return unauthorizedResponse()
  if (!await hasPlaidMfa(supabase)) return NextResponse.json({ error: 'verification_required', message: 'Verify your identity to manage your bank connection.' }, { status: 403 })
  const body = await request.json().catch(() => null) as { itemId?: unknown } | null
  if (!body || typeof body.itemId !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  try {
    return NextResponse.json(await disconnectPlaidItem({ supabase, itemRecordId: body.itemId }))
  } catch {
    return NextResponse.json({ error: 'disconnect_failed', message: 'This connection could not be disconnected.' }, { status: 502 })
  }
}
