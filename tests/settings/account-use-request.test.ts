import { afterEach, describe, expect, it, vi } from 'vitest'
import { persistAccountUse, type AccountUseDesignation } from '../../app/lib/bookkeeping/account-use-request'
const accountId = '11111111-1111-4111-8111-111111111111'
const eventId = '33333333-3333-4333-8333-333333333333'
const request = (designation: AccountUseDesignation) => ({ designation, effectiveAt: '2026-09-17T20:00:00.000Z', requestId: '22222222-2222-4222-8222-222222222222' })
afterEach(() => vi.unstubAllGlobals())
describe('account-use browser/API contract', () => {
  it.each(['business_only', 'business_and_personal'] as const)('confirms %s only from a persisted event', async designation => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, eventId }))
    vi.stubGlobal('fetch', fetch)
    expect(await persistAccountUse(accountId, request(designation))).toBe(eventId)
    expect(fetch).toHaveBeenCalledWith(`/api/bookkeeping/accounts/${accountId}/use`, expect.objectContaining({method: 'POST', keepalive: true, body: JSON.stringify(request(designation))}))
  })
  it.each([
    new Response('<html>Sign in</html>', {status: 200}),
    Response.json({ok: true}), Response.json({ok: false, eventId}),
    Response.json({ok: true, eventId: 'not-an-event'}),
    Response.json({error: 'denied'}, {status: 403}),
  ])('does not display success without canonical acknowledgement', async response => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(persistAccountUse(accountId, request('business_only'))).rejects.toThrow('not been confirmed')
  })
  it('preserves the request identity when retrying a lost response', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(Response.json({ok: true, eventId}))
    vi.stubGlobal('fetch', fetch)
    const attempt = request('business_and_personal')
    await expect(persistAccountUse(accountId, attempt)).rejects.toThrow('network')
    expect(await persistAccountUse(accountId, attempt)).toBe(eventId)
    expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1])
  })
})
