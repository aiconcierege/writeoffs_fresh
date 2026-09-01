import { createHmac } from 'node:crypto'

export const WAITLIST_BODY_MAX_BYTES = 4096
export const WAITLIST_EMAIL_MAX_LENGTH = 254
export const WAITLIST_NAME_MAX_LENGTH = 100
export const WAITLIST_RATE_LIMIT = 6
export const WAITLIST_RATE_WINDOW_SECONDS = 600

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type WaitlistSubmission = {
  email: string
  name: string | null
  source: 'landing#waitlist'
}

export type WaitlistParseResult =
  | { ok: true; value: WaitlistSubmission }
  | { ok: false; error: string }

export function parseWaitlistSubmission(input: unknown): WaitlistParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Please enter a valid name and email.' }
  }

  const body = input as Record<string, unknown>
  if (typeof body.email !== 'string') {
    return { ok: false, error: 'Please enter a valid email address.' }
  }
  const email = body.email.trim().toLowerCase()
  if (!email || email.length > WAITLIST_EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }

  if (body.name !== undefined && body.name !== null && typeof body.name !== 'string') {
    return { ok: false, error: 'Please enter a valid name.' }
  }
  const trimmedName = typeof body.name === 'string' ? body.name.trim() : ''
  if (trimmedName.length > WAITLIST_NAME_MAX_LENGTH) {
    return { ok: false, error: `Name must be ${WAITLIST_NAME_MAX_LENGTH} characters or fewer.` }
  }

  return {
    ok: true,
    value: { email, name: trimmedName || null, source: 'landing#waitlist' },
  }
}

export function waitlistClientAddress(headers: Headers) {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown'
}

export function waitlistRateLimitKey(address: string, secret: string) {
  return createHmac('sha256', secret).update(`waitlist:${address}`).digest('hex')
}
