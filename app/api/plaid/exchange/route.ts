import { NextResponse } from 'next/server'
import { getAuthenticatedContext, unauthorizedResponse } from '../../../lib/auth/require-user'
import { exchangePlaidPublicToken } from '../../../lib/plaid/service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return unauthorizedResponse()
  const body = await request.json().catch(() => null) as null | {
    publicToken?: unknown; requestId?: unknown
    institution?: { id?: unknown; name?: unknown }
  }
  if (!body || typeof body.publicToken !== 'string' || typeof body.requestId !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const institution = body.institution &&
    (body.institution.id == null || typeof body.institution.id === 'string') &&
    (body.institution.name == null || typeof body.institution.name === 'string')
    ? { id: body.institution.id as string | null, name: body.institution.name as string | null }
    : null
  try {
    const result = await exchangePlaidPublicToken({
      supabase, publicToken: body.publicToken, requestId: body.requestId, institution,
    })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const conflict = error instanceof Error && error.message === 'EXCHANGE_ALREADY_IN_PROGRESS'
    return NextResponse.json({
      error: conflict ? 'request_in_progress' : 'connection_failed',
      message: conflict ? 'This connection is still being finished.' : 'We couldn’t finish connecting this account.',
    }, { status: conflict ? 409 : 502 })
  }
}
