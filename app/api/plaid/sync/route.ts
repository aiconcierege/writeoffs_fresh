import { NextResponse } from 'next/server'
import { getAuthenticatedContext, unauthorizedResponse } from '../../../lib/auth/require-user'
import { syncPlaidItemsForCustomer } from '../../../lib/plaid/service'

export const runtime = 'nodejs'

export async function POST() {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return unauthorizedResponse()
  try {
    const results = await syncPlaidItemsForCustomer({ supabase })
    return NextResponse.json({ updated: true, results }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'update_failed', message: 'Accounts could not be updated right now.' }, { status: 502 })
  }
}
