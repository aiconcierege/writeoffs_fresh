import {beforeEach,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({load:vi.fn(),user:vi.fn()}))
vi.mock('../../utils/supabase/server',()=>({createServerSupabase:async()=>({})}))
vi.mock('../../app/lib/performance/request-identity',()=>({requestUser:mocks.user}))
vi.mock('../../app/lib/bookkeeping/special-transactions',()=>({loadSpecialWork:mocks.load}))
vi.mock('../../app/lib/bookkeeping/guided-command-response',()=>({guidedCommand:(handler:unknown)=>handler}))
import {GET} from '../../app/api/bookkeeping/records/[id]/special/route'
beforeEach(()=>{vi.clearAllMocks();mocks.user.mockResolvedValue({data:{user:{id:'owner'}}});mocks.load.mockResolvedValue({decisionId:'current',kind:'refund'})})
const request=(expected:string)=>GET(new Request('https://example.test/api/bookkeeping/records/record/special?expected='+expected),{params:Promise.resolve({id:'record'})})
it('does not render newer special-work details under an older canonical action',async()=>{
 const response=await request('old');expect(response.status).toBe(409)
 expect(await response.json()).not.toHaveProperty('work')
})
it('returns detail only for the expected current decision',async()=>{
 const response=await request('current');expect(response.status).toBe(200)
 expect((await response.json()).work.kind).toBe('refund')
 expect(response.headers.get('cache-control')).toBe('private, no-store')
})
it('does not load details before authentication',async()=>{
 mocks.user.mockResolvedValue({data:{user:null}})
 expect((await request('current')).status).toBe(401);expect(mocks.load).not.toHaveBeenCalled()
})
it('does not expose unavailable or foreign record details',async()=>{
 mocks.load.mockResolvedValue(null)
 expect((await request('current')).status).toBe(404)
})
