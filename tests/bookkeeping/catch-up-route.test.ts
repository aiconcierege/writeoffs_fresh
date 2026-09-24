import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({user:vi.fn(),prior:vi.fn(),rpc:vi.fn(),work:vi.fn(),capability:vi.fn()}))
vi.mock('../../utils/supabase/server',()=>({createServerSupabase:async()=>({auth:{getUser:m.user},rpc:m.rpc,from:()=>({select:()=>({eq:()=>({maybeSingle:m.prior})})})})}))
vi.mock('../../app/lib/bookkeeping/customer-work',()=>({loadCurrentCustomerWork:m.work}))
vi.mock('../../app/lib/membership/entitlements',()=>({requireCapability:m.capability,membershipErrorResponse:()=>({error:'Membership required',status:403})}))
import {POST} from '../../app/api/bookkeeping/work/catch-up/route'
const body={actionId:'catch-up:owned',version:'version1',requestId:'11111111-1111-4111-8111-111111111111',response:'none',items:[],selectedIds:[],documentIds:[],journey:{scopeKey:'a'.repeat(64),stage:'receipts',from:'2026-01-01',through:'2026-07-31'}}
const doc='22222222-2222-4222-8222-222222222222'
const send=(value:unknown=body)=>POST(new Request('http://localhost/api/bookkeeping/work/catch-up',{method:'POST',body:JSON.stringify(value)}))
beforeEach(()=>{vi.clearAllMocks();m.user.mockResolvedValue({data:{user:{id:'owner'}}});m.prior.mockResolvedValue({data:null});m.rpc.mockResolvedValue({data:{recorded:true},error:null});m.capability.mockResolvedValue({});m.work.mockResolvedValue({actions:[{id:body.actionId,version:body.version,type:'catch_up_journey',items:[],journey:body.journey}]})})
describe('catch-up stage durable response boundary',()=>{
 it('requires an authenticated entitled customer',async()=>{
  m.user.mockResolvedValueOnce({data:{user:null}});expect((await send()).status).toBe(401)
  m.capability.mockRejectedValueOnce(new Error());expect((await send()).status).toBe(403);expect(m.rpc).not.toHaveBeenCalled()
 })
 it.each(['none','later','continue'])('preserves the distinct %s response',async response=>{
  expect((await send({...body,response})).status).toBe(200)
  expect(m.rpc).toHaveBeenCalledWith('answer_catch_up_stage',expect.objectContaining({p_response:response,p_items:[],p_documents:[]}))
 })
 it.each([null,{...body,response:'invented'},{...body,response:'uploaded'},{...body,documentIds:[doc]},{...body,journey:null},{...body,documentIds:Array(11).fill(doc)}])('rejects malformed or contradictory responses',async input=>{
  expect((await send(input)).status).toBe(400);expect(m.rpc).not.toHaveBeenCalled()
 })
 it.each([{...body,version:'old'},{...body,items:[{amountCents:-1}]}])('rejects stale or changed factual review snapshots',async input=>{
  expect((await send(input)).status).toBe(409);expect(m.rpc).not.toHaveBeenCalled()
 })
 it('acknowledges stored evidence even while its former stage is waiting or obsolete',async()=>{
  m.work.mockResolvedValue({actions:[]})
  expect((await send({...body,response:'uploaded',documentIds:[doc]})).status).toBe(200)
  expect(m.work).not.toHaveBeenCalled()
  expect(m.rpc).toHaveBeenCalledWith('answer_catch_up_stage',expect.objectContaining({p_documents:[doc],p_response:'uploaded'}))
 })
 it('leaves document ownership and retry conflicts fail-closed in SQL',async()=>{
  m.prior.mockResolvedValue({data:{id:body.requestId}});m.rpc.mockResolvedValue({error:{message:'conflict'}})
  expect((await send()).status).toBe(409);expect(m.work).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledOnce()
 })
})
