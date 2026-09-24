import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({user:vi.fn(),rpc:vi.fn(),capability:vi.fn()}))
vi.mock('../../utils/supabase/server',()=>({createServerSupabase:async()=>({auth:{getUser:m.user},rpc:m.rpc})}))
vi.mock('../../app/lib/membership/entitlements',()=>({requireCapability:m.capability,membershipErrorResponse:()=>({error:'Membership required',status:403})}))
import {POST} from '../../app/api/documents/[id]/set-aside/route'
const id='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222'
const send=(body:unknown={requestId},document=id)=>POST(new Request('http://localhost/api/documents/'+document+'/set-aside',{method:'POST',body:JSON.stringify(body)}),{params:Promise.resolve({id:document})})
beforeEach(()=>{vi.clearAllMocks();m.user.mockResolvedValue({data:{user:{id:'owner'}}});m.rpc.mockResolvedValue({data:true,error:null});m.capability.mockResolvedValue({})})
describe('unrecognized upload disposition',()=>{
 it('requires authentication and membership before making a choice',async()=>{
  m.user.mockResolvedValueOnce({data:{user:null}});expect((await send()).status).toBe(401)
  m.capability.mockRejectedValueOnce(new Error());expect((await send()).status).toBe(403);expect(m.rpc).not.toHaveBeenCalled()
 })
 it.each([null,{}, {requestId:'invalid'}])('rejects malformed requests',async body=>{expect((await send(body)).status).toBe(400);expect(m.rpc).not.toHaveBeenCalled()})
 it('only invokes the guarded owner-scoped operation with a durable request identity',async()=>{
  const result=await send();expect(result.status).toBe(200);expect(result.headers.get('Cache-Control')).toBe('private, no-store')
  expect(m.rpc).toHaveBeenCalledWith('set_aside_unrecognized_document',{p_document:id,p_request:requestId})
 })
 it('does not expose database evidence or override a denied disposition',async()=>{
  m.rpc.mockResolvedValue({error:{message:'private database detail'},data:null})
  const r=await send();expect(r.status).toBe(409);expect(await r.text()).not.toContain('private database detail')
 })
})
