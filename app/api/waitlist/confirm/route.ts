import { NextResponse } from 'next/server'
import { createServerAdminSupabase } from '../../../../utils/supabase/admin'
import {
  parseWaitlistSubmission,
  WAITLIST_BODY_MAX_BYTES,
  WAITLIST_RATE_LIMIT,
  WAITLIST_RATE_WINDOW_SECONDS,
  waitlistClientAddress,
  waitlistRateLimitKey,
} from '../../../lib/public/waitlist'

export const runtime = 'nodejs'

function json(body: Record<string, unknown>, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extraHeaders },
  })
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > WAITLIST_BODY_MAX_BYTES) {
    return json({ error: 'That request is too large.' }, 413)
  }

  let rawBody = ''
  let parsedBody: unknown
  try {
    rawBody = await request.text()
    if (Buffer.byteLength(rawBody, 'utf8') > WAITLIST_BODY_MAX_BYTES) {
      return json({ error: 'That request is too large.' }, 413)
    }
    parsedBody = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Please enter a valid name and email.' }, 400)
  }

  const parsed = parseWaitlistSubmission(parsedBody)
  if (!parsed.ok) return json({ error: parsed.error }, 400)

  try {
    const admin = createServerAdminSupabase()
    const rateSecret = process.env.WAITLIST_RATE_LIMIT_SECRET
      ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!rateSecret) throw new Error('Waitlist rate-limit configuration is unavailable.')
    const keyHash = waitlistRateLimitKey(waitlistClientAddress(request.headers), rateSecret)
    const { data: allowed, error: rateError } = await admin.rpc('consume_waitlist_rate_limit', {
      p_key_hash: keyHash,
      p_limit: WAITLIST_RATE_LIMIT,
      p_window_seconds: WAITLIST_RATE_WINDOW_SECONDS,
    })
    if (rateError) throw rateError
    if (!allowed) {
      return json(
        { error: 'Please wait a few minutes before trying again.' },
        429,
        { 'Retry-After': String(WAITLIST_RATE_WINDOW_SECONDS) },
      )
    }

    const { error } = await admin.from('waitlist').insert(parsed.value)
    if (error?.code === '23505') {
      return json({ success: true, duplicate: true })
    }
    if (error) throw error
    return json({ success: true, duplicate: false }, 201)
  } catch (error) {
    console.error('Waitlist submission failed.', error instanceof Error ? error.message : 'Unknown error')
    return json({ error: 'The waitlist is temporarily unavailable. Please try again.' }, 503)
  }
}
