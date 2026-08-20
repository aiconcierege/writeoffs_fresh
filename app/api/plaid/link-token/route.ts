import { NextResponse } from 'next/server'
import { getAuthenticatedContext, unauthorizedResponse } from '../../../lib/auth/require-user'
import { createPlaidLinkToken } from '../../../lib/plaid/service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return unauthorizedResponse()
  try {
    const body = await request.json().catch(() => ({})) as { itemId?: unknown }
    if (body.itemId != null && typeof body.itemId !== 'string') {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }
    const result = await createPlaidLinkToken({ supabase, itemRecordId: body.itemId ?? null })
    return NextResponse.json({ linkToken: result.link_token, expiration: result.expiration }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'temporarily_unavailable', message: 'Bank connection setup is unavailable right now.' }, { status: 503 })
  }
}
