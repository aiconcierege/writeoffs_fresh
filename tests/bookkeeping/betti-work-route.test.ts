import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), mfa: vi.fn(), membership: vi.fn(), queue: vi.fn() }))
vi.mock('../../utils/supabase/server', () => ({ createServerSupabase: async () => ({
  auth: { getUser: mocks.getUser, mfa: { getAuthenticatorAssuranceLevel: mocks.mfa } }, rpc: mocks.rpc,
}) }))
vi.mock('../../app/lib/membership/entitlements', () => ({ loadCustomerEntitlements: mocks.membership }))
vi.mock('../../app/lib/bookkeeping/customer-questions', () => ({ getCanonicalQuestionCandidates: mocks.queue }))
import {WORK_INPUT_TABLES} from '../../app/lib/bookkeeping/work-input-snapshot'
import { GET } from '../../app/api/bookkeeping/work/route'
const business = '10000000-0000-4000-8000-000000000001'
const snapshot = () => ({ business: { id: business, start: '2026-01-01', activation: '2026-09-01',
  activationEvidence: '2026-09-01T12:00:00Z', timezone: 'UTC', coverageStart: '2026-01-01', authorizedScope: {businessId:business,selectedStart:'2026-01-01',authorizedStart:'2026-01-01',includedStart:'2026-08-01',activation:'2026-09-01',historicalAuthorized:true,currentFrom:'2026-09-01',catchUp:{from:'2026-01-01',through:'2026-08-31'}} },
records: [], accounts: [], jobs: [], documents: [], links: [], coverage: [], deferred: [], questionVersions: [] })
const inputSnapshot=(context=snapshot(),asOf=new Date().toISOString())=>({version:1,businessId:business,asOf,context,reviews:[],askable:[],tables:Object.fromEntries(WORK_INPUT_TABLES.map(name=>[name,[]])),timings:{}})
const request = () => new Request('https://writeoffs.example/api/bookkeeping/work')
afterEach(()=>vi.unstubAllEnvs())
beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null })
  mocks.mfa.mockResolvedValue({ data: { currentLevel: 'aal2' } })
  mocks.membership.mockResolvedValue({ businessId: business, lifecycle: 'active', plan: 'business', capabilities: new Set(['autonomous_processing']) })
  mocks.queue.mockResolvedValue({ questions: [] })
  mocks.rpc.mockImplementation(async (name: string, args: {p_business_id:string;p_as_of:string}) => {
    expect(name).toBe('read_betti_work_inputs')
    expect(args.p_business_id).toBe(business)
    return { data: inputSnapshot(snapshot(),args.p_as_of), error: null }
  })
})
describe('authenticated Betti work GET boundary', () => {
  it('reconciles a visible action against canonical inputs even when the staging index is enabled',async()=>{
    vi.stubEnv('WRITEOFFS_ENVIRONMENT','staging')
    vi.stubEnv('BETTI_ACTION_INDEX_ENABLED','true')
    const response=await GET(new Request('https://writeoffs.example/api/bookkeeping/work?view=guided&presented=account:test:use&presentedVersion=old'))
    expect(response.status).toBe(200)
    expect(mocks.rpc.mock.calls.map(call=>call[0])).toEqual(['read_betti_work_inputs'])
    expect((await response.json()).presentation).toBeDefined()
  })
  it('reads only; does not call reconcile, enqueue, answer, or create', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect((await response.json()).nextAction.type).toBe('provide_records')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.queue).toHaveBeenCalledWith(expect.objectContaining({ scope: 'business' }))
  })
  it('guided GET is a smaller representation of the same canonical next action and count',async()=>{
    const full=await (await GET(request())).json()
    const narrow=await (await GET(new Request('https://writeoffs.example/api/bookkeeping/work?view=guided'))).json()
    expect(narrow.nextAction).toEqual(full.nextAction)
    expect(narrow.customer.actionableCount).toBe(full.customer.actionableCount)
    expect(narrow.customer).not.toHaveProperty('actionable')
    expect(narrow.betti).not.toHaveProperty('jobs')
  })
  it('takes business ownership from membership, never a URL business ID', async () => {
    const response = await GET(new Request('https://writeoffs.example/api/bookkeeping/work?businessId=foreign&returnTo=https://evil.example'))
    expect(response.status).toBe(200)
    expect((await response.json()).businessId).toBe(business)
  })
  it('revalidates presented work against the canonical set without mutating or changing its count',async()=>{
    const full=await (await GET(request())).json()
    const params=new URLSearchParams({view:'guided',presented:full.nextAction.id,presentedVersion:full.nextAction.version})
    const response=await GET(new Request('https://writeoffs.example/api/bookkeeping/work?'+params))
    const value=await response.json()
    expect(value.presentation).toEqual({status:'retained',action:full.nextAction})
    expect(value.nextAction).toEqual(full.nextAction)
    expect(value.customer.actionableCount).toBe(full.customer.actionableCount)
    expect(mocks.rpc.mock.calls.every(([name])=>name==='read_betti_work_inputs')).toBe(true)
  })
  it('never loads a foreign action supplied as presentation context',async()=>{
    const response=await GET(new Request('https://writeoffs.example/api/bookkeeping/work?view=guided&presented=foreign-action&presentedVersion=foreign-version'))
    const value=await response.json()
    expect(value.businessId).toBe(business)
    expect(value.presentation).toEqual({status:'updated',action:value.nextAction})
    expect(JSON.stringify(value)).not.toContain('foreign')
  })
  it('rejects incomplete presentation context',async()=>{
    expect((await GET(new Request('https://writeoffs.example/api/bookkeeping/work?presented=action'))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each([['unauthenticated', 401], ['MFA', 403], ['membership', 403]])('rejects %s before loading work', async (kind, status) => {
    if (kind === 'unauthenticated') mocks.getUser.mockResolvedValue({ data: { user: null } })
    if (kind === 'MFA') mocks.mfa.mockResolvedValue({ data: { currentLevel: 'aal1' } })
    if (kind === 'membership') mocks.membership.mockResolvedValue({ businessId: null, lifecycle: 'none' })
    expect((await GET(request())).status).toBe(status)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('rejects a foreign tenant returned by any adapter', async () => {
    mocks.rpc.mockImplementation(async (_name:string,args:{p_as_of:string})=>({data:inputSnapshot({...snapshot(),jobs:[{business_id:'foreign'}]} as ReturnType<typeof snapshot>,args.p_as_of)}))
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('foreign')
  })
  it('uses one atomic snapshot instead of joining independently timed context reads', async () => {
    expect((await GET(request())).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it('fails closed rather than report false zero counts when a read fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'private diagnostic' } })
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private diagnostic')
  })
  it('does not silently count a potentially truncated canonical question queue', async () => {
    mocks.rpc.mockImplementation(async(_name:string,args:{p_as_of:string})=>({data:inputSnapshot({...snapshot(),questionVersions:Array.from({length:1000},(_,i)=>String(i))} as ReturnType<typeof snapshot>,args.p_as_of)}))
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
