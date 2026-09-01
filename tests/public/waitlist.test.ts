import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  parseWaitlistSubmission,
  WAITLIST_BODY_MAX_BYTES,
  waitlistRateLimitKey,
} from '../../app/lib/public/waitlist'

const rpc = vi.fn()
const insert = vi.fn()
vi.mock('../../utils/supabase/admin', () => ({
  createServerAdminSupabase: () => ({
    rpc,
    from: () => ({ insert }),
  }),
}))

describe('public waitlist validation', () => {
  it('normalizes valid customer input', () => {
    expect(parseWaitlistSubmission({ email: '  RICK@Example.COM ', name: '  Rick  ', source: 'forged' }))
      .toEqual({ ok: true, value: { email: 'rick@example.com', name: 'Rick', source: 'landing#waitlist' } })
  })

  it.each([
    [null], [{ email: 'not-an-email' }], [{ email: 'a@b' }],
    [{ email: `${'a'.repeat(245)}@example.com` }], [{ email: 'a@example.com', name: 4 }],
    [{ email: 'a@example.com', name: 'n'.repeat(101) }],
  ])('rejects malformed or overlong input %#', input => {
    expect(parseWaitlistSubmission(input).ok).toBe(false)
  })

  it('creates stable, secret-bound pseudonymous rate keys', () => {
    expect(waitlistRateLimitKey('203.0.113.4', 'secret')).toMatch(/^[0-9a-f]{64}$/)
    expect(waitlistRateLimitKey('203.0.113.4', 'secret'))
      .not.toBe(waitlistRateLimitKey('203.0.113.4', 'different'))
  })
})

describe('public waitlist endpoint', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-service-secret'
    rpc.mockResolvedValue({ data: true, error: null })
    insert.mockResolvedValue({ error: null })
  })

  async function submit(body: unknown, headers: Record<string,string> = {}) {
    const { POST } = await import('../../app/api/waitlist/confirm/route')
    return POST(new Request('http://localhost/api/waitlist/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.4', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }))
  }

  it('inserts normalized data and returns a distinct first-time result', async () => {
    const response = await submit({ email: ' RICK@EXAMPLE.COM ', name: ' Rick ' })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ success: true, duplicate: false })
    expect(insert).toHaveBeenCalledWith({ email: 'rick@example.com', name: 'Rick', source: 'landing#waitlist' })
  })

  it('treats a unique-email collision as idempotent success', async () => {
    insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } })
    const response = await submit({ email: 'rick@example.com' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, duplicate: true })
  })

  it('rejects malformed and oversized bodies without database work', async () => {
    expect((await submit('{bad json')).status).toBe(400)
    expect((await submit({ email: 'nope' })).status).toBe(400)
    const oversized = JSON.stringify({ email: `${'a'.repeat(WAITLIST_BODY_MAX_BYTES)}@example.com` })
    expect((await submit(oversized)).status).toBe(413)
    expect(insert).not.toHaveBeenCalled()
  })

  it('throttles rapid submissions with a retry contract', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    const response = await submit({ email: 'rick@example.com' })
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('600')
    expect(insert).not.toHaveBeenCalled()
  })

  it('returns a safe temporary failure without leaking database details', async () => {
    insert.mockResolvedValue({ error: { code: 'XX000', message: 'secret database detail' } })
    const response = await submit({ email: 'rick@example.com' })
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('secret database detail')
  })
})
