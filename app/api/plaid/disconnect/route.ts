import { NextResponse } from 'next/server'
import { getAuthenticatedContext, unauthorizedResponse } from '../../../lib/auth/require-user'
import { disconnectPlaidItem } from '../../../lib/plaid/service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return unauthorizedResponse()
  const body = await request.json().catch(() => null) as { itemId?: unknown } | null
  if (!body || typeof body.itemId !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  try {
    return NextResponse.json(await disconnectPlaidItem({ supabase, itemRecordId: body.itemId }))
  } catch {
    return NextResponse.json({ error: 'disconnect_failed', message: 'This connection could not be disconnected.' }, { status: 502 })
  }
}
