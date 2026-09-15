import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { entitlementsFromMembership } from '../../app/lib/membership/entitlements'
import { nextRequiredCustomerDestination } from '../../app/lib/auth/prerequisite-policy'

const mocks = vi.hoisted(() => ({ context: vi.fn(), capability: vi.fn(), token: vi.fn(), rpc: vi.fn(), from: vi.fn() }))
vi.mock('../../app/lib/auth/require-user', async (original) => ({ ...await original<object>(), getAuthenticatedContext: mocks.context }))
vi.mock('../../app/lib/membership/entitlements', async (original) => ({ ...await original<object>(), requireCapability: mocks.capability }))
vi.mock('../../app/lib/plaid/service', () => ({ createPlaidLinkToken: mocks.token }))
import { POST } from '../../app/api/plaid/link-token/route'
const request = (body: unknown = {}) => new Request('https://example.test/api/plaid/link-token', { method: 'POST', body: JSON.stringify(body) })
const connection = (connection_status = 'connected', consent_status = 'active') => ({ connection_status, consent_status })

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  mocks.context.mockResolvedValue({ user: { id: 'fresh-customer' }, supabase: { rpc: mocks.rpc, from: mocks.from } })
  // The credential table must remain inaccessible to an authenticated customer.
  mocks.from.mockImplementation(() => { throw new Error('permission denied for table plaid_items') })
  mocks.capability.mockResolvedValue(entitlementsFromMembership({ business_id: 'owned-business', plan: 'expenses', lifecycle: 'active', authority: 'stripe' }))
  mocks.rpc.mockResolvedValue({ data: [], error: null })
  mocks.token.mockResolvedValue({ link_token: 'test-link-token', expiration: '2026-09-15T20:00:00Z' })
})

afterEach(() => vi.restoreAllMocks())

describe('customer Plaid Link initialization', () => {
  it('opens the token path after a new customer completes MFA, paid membership and onboarding without any prior Item', async () => {
    const state = { mfaSatisfied: true, mfaFactorEnrolled: true, membershipLifecycle: 'active', onboardingComplete: true, getStartedComplete: false }
    expect(nextRequiredCustomerDestination({ ...state, mfaSatisfied: false }, '/get-started')).toContain('/mfa/challenge')
    expect(nextRequiredCustomerDestination({ ...state, membershipLifecycle: null }, '/get-started')).toBe('/membership')
    expect(nextRequiredCustomerDestination({ ...state, onboardingComplete: false }, '/get-started')).toBe('/onboarding')
    expect(nextRequiredCustomerDestination(state, '/get-started')).toBeNull()
    const response = await POST(request({ itemId: null }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ linkToken: 'test-link-token' })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.rpc).toHaveBeenCalledWith('list_plaid_connections')
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.capability).toHaveBeenCalledWith(expect.anything(), 'track_expenses')
  })
  it('lets an existing customer add an account below the limit, excluding disconnected and revoked Items', async () => {
    mocks.rpc.mockResolvedValue({ data: [connection(), connection('disconnected'), connection('connected', 'revoked')], error: null })
    expect((await POST(request())).status).toBe(200)
  })
  it('preserves the active connection limit', async () => {
    mocks.rpc.mockResolvedValue({ data: [connection(), connection('updating'), connection('reconnect_required')], error: null })
    expect((await POST(request())).status).toBe(403)
    expect(mocks.token).not.toHaveBeenCalled()
  })
  it.each([{ data: null, error: { code: '42501' } }, { data: null, error: null }])('fails closed when connection metadata is unavailable', async (result) => {
    mocks.rpc.mockResolvedValue(result)
    expect((await POST(request())).status).toBe(503)
    expect(mocks.token).not.toHaveBeenCalled()
  })
  it('preserves existing reconnect behavior at the connection limit', async () => {
    expect((await POST(request({ itemId: 'existing-owned-item' }))).status).toBe(200)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.token).toHaveBeenCalledWith(expect.objectContaining({ itemRecordId: 'existing-owned-item' }))
  })
  it('never uses a submitted business ID for ownership or counting', async () => {
    expect((await POST(request({ businessId: 'other-tenant' }))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('list_plaid_connections')
    expect(mocks.token).toHaveBeenCalledWith({ supabase: expect.anything(), itemRecordId: null })
  })
  it.each(['MEMBERSHIP_REQUIRED', 'MEMBERSHIP_READ_ONLY'])('keeps membership/lifecycle enforcement: %s', async (message) => {
    mocks.capability.mockRejectedValue(new Error(message))
    expect((await POST(request())).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.token).not.toHaveBeenCalled()
  })
  it('rejects unauthenticated access', async () => {
    mocks.context.mockResolvedValue({ user: null })
    expect((await POST(request())).status).toBe(401)
    expect(mocks.token).not.toHaveBeenCalled()
  })
  it('logs only an allowlisted provider code, without its request credentials or error message', async () => {
    mocks.token.mockRejectedValue({ response: { data: { error_code: 'INVALID_FIELD', error_message: 'sensitive details' } }, config: { headers: { secret: 'sensitive secret' } } })
    expect((await POST(request())).status).toBe(503)
    expect(console.warn).toHaveBeenCalledWith('plaid_link_initialization_failed', { code: 'INVALID_FIELD' })
  })
  it('identifies a rejected redirect without exposing its URL', async () => {
    mocks.token.mockRejectedValue({ response: { data: { error_code: 'INVALID_FIELD', error_message: 'The Redirect URI contains sensitive details' } } })
    expect((await POST(request())).status).toBe(503)
    expect(console.warn).toHaveBeenCalledWith('plaid_link_initialization_failed', { code: 'INVALID_FIELD_REDIRECT_URI' })
  })
  it('does not expose provider errors or credentials', async () => {
    mocks.token.mockRejectedValue(new Error('sensitive provider details'))
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('sensitive')
    expect(console.warn).toHaveBeenCalledWith('plaid_link_initialization_failed', { code: 'LINK_REQUEST_FAILED' })
  })
})
