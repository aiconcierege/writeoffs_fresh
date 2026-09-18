import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), mfa: vi.fn(), membership: vi.fn(), queue: vi.fn() }))
vi.mock('../../utils/supabase/server', () => ({ createServerSupabase: async () => ({
  auth: { getUser: mocks.getUser, mfa: { getAuthenticatorAssuranceLevel: mocks.mfa } }, rpc: mocks.rpc,
}) }))
vi.mock('../../app/lib/membership/entitlements', () => ({ loadCustomerEntitlements: mocks.membership }))
vi.mock('../../app/lib/bookkeeping/customer-questions', () => ({ getCanonicalQuestionCandidates: mocks.queue }))
import { GET } from '../../app/api/bookkeeping/work/route'
const business = '10000000-0000-4000-8000-000000000001'
const snapshot = () => ({ business: { id: business, start: '2026-01-01', activation: '2026-09-01',
  activationEvidence: '2026-09-01T12:00:00Z', timezone: 'UTC', coverageStart: '2026-01-01', authorizedScope: {businessId:business,selectedStart:'2026-01-01',authorizedStart:'2026-01-01',includedStart:'2026-08-01',activation:'2026-09-01',historicalAuthorized:true,currentFrom:'2026-09-01',catchUp:{from:'2026-01-01',through:'2026-08-31'}} },
records: [], accounts: [], jobs: [], documents: [], links: [], coverage: [], deferred: [], questionVersions: [] })
const request = () => new Request('https://writeoffs.example/api/bookkeeping/work')
beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null })
  mocks.mfa.mockResolvedValue({ data: { currentLevel: 'aal2' } })
  mocks.membership.mockResolvedValue({ businessId: business, lifecycle: 'active', plan: 'business', capabilities: new Set(['autonomous_processing']) })
  mocks.queue.mockResolvedValue({ questions: [] })
  mocks.rpc.mockImplementation(async (name: string, args: unknown) => {
    expect(name).toBe('read_betti_work_context')
    expect(args).toEqual({ p_business_id: business })
    return { data: snapshot(), error: null }
  })
})
describe('authenticated Betti work GET boundary', () => {
  it('reads only; does not call reconcile, enqueue, answer, or create', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect((await response.json()).nextAction.type).toBe('provide_records')
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(mocks.queue).toHaveBeenCalledWith(expect.objectContaining({ scope: 'business' }))
  })
  it('takes business ownership from membership, never a URL business ID', async () => {
    const response = await GET(new Request('https://writeoffs.example/api/bookkeeping/work?businessId=foreign&returnTo=https://evil.example'))
    expect(response.status).toBe(200)
    expect((await response.json()).businessId).toBe(business)
  })
  it.each([['unauthenticated', 401], ['MFA', 403], ['membership', 403]])('rejects %s before loading work', async (kind, status) => {
    if (kind === 'unauthenticated') mocks.getUser.mockResolvedValue({ data: { user: null } })
    if (kind === 'MFA') mocks.mfa.mockResolvedValue({ data: { currentLevel: 'aal1' } })
    if (kind === 'membership') mocks.membership.mockResolvedValue({ businessId: null, lifecycle: 'none' })
    expect((await GET(request())).status).toBe(status)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('rejects a foreign tenant returned by any adapter', async () => {
    mocks.rpc.mockResolvedValue({ data: { ...snapshot(), jobs: [{ business_id: 'foreign' }] } })
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('foreign')
  })
  it('retries a concurrent context change without issuing any command', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: snapshot() }).mockResolvedValueOnce({ data: { ...snapshot(), questionVersions: ['new'] } })
    expect((await GET(request())).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(4)
  })
  it('fails closed rather than report false zero counts when a read fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'private diagnostic' } })
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private diagnostic')
  })
  it('does not silently count a potentially truncated canonical question queue', async () => {
    mocks.rpc.mockResolvedValue({ data: { ...snapshot(), questionVersions: Array.from({ length: 1000 }, (_, i) => String(i)) } })
    expect((await GET(request())).status).toBe(503)
    expect(mocks.queue).not.toHaveBeenCalled()
  })
  it('view-only members may inspect but do not receive permission to act', async () => {
    mocks.membership.mockResolvedValue({ businessId: business, lifecycle: 'expired_read_only', plan: 'business', capabilities: new Set() })
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect((await response.json()).actionsEnabled).toBe(false)
  })
})
