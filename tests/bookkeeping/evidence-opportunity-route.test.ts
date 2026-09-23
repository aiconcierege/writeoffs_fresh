import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({user:vi.fn(),prior:vi.fn(),rpc:vi.fn(),work:vi.fn(),capability:vi.fn()}))
vi.mock('../../utils/supabase/server',()=>({createServerSupabase:async()=>({auth:{getUser:m.user},rpc:m.rpc,from:()=>({select:()=>({eq:()=>({maybeSingle:m.prior})})})})}))
vi.mock('../../app/lib/bookkeeping/customer-work',()=>({loadCurrentCustomerWork:m.work}))
vi.mock('../../app/lib/membership/entitlements',()=>({requireCapability:m.capability,membershipErrorResponse:()=>({error:'Membership required',status:403})}))
import {POST} from '../../app/api/bookkeeping/work/evidence/route'
const item={recordId:'record',decisionId:'decision',reviewVersion:'evidence',accountUseVersion:'account',merchant:'Store',date:'2026-05-12',amountCents:-10000,transactionId:'source'}
const body={actionId:'evidence:owned',version:'version1',requestId:'11111111-1111-4111-8111-111111111111',response:'none',items:[item],documentIds:[]}
const doc='22222222-2222-4222-8222-222222222222'
const send=(value:unknown=body)=>POST(new Request('http://localhost/api/bookkeeping/work/evidence',{method:'POST',body:JSON.stringify(value)}))
beforeEach(()=>{vi.clearAllMocks();m.user.mockResolvedValue({data:{user:{id:'owner'}}});m.prior.mockResolvedValue({data:null});m.rpc.mockResolvedValue({data:{recorded:true},error:null});m.capability.mockResolvedValue({});m.work.mockResolvedValue({actions:[{id:body.actionId,version:body.version,type:'evidence_opportunity',items:[item]}]})})
describe('evidence opportunity API',()=>{
 it('requires an authenticated entitled customer',async()=>{
  m.user.mockResolvedValueOnce({data:{user:null}});expect((await send()).status).toBe(401)
  m.capability.mockRejectedValueOnce(new Error());expect((await send()).status).toBe(403);expect(m.rpc).not.toHaveBeenCalled()
 })
 it.each(['none','later'])('preserves the distinct %s response and exact displayed items',async response=>{
  expect((await send({...body,response})).status).toBe(200)
  expect(m.rpc).toHaveBeenCalledWith('answer_betti_evidence_opportunity',{p_request:body.requestId,p_items:[item],p_response:response,p_document_ids:[]})
 })
 it.each([null,{...body,response:'invented'},{...body,response:'provided'},{...body,documentIds:[doc]},{...body,items:[]},{...body,documentIds:Array(11).fill(doc)}])('rejects malformed or contradictory responses',async input=>{
  expect((await send(input)).status).toBe(400);expect(m.rpc).not.toHaveBeenCalled()
 })
 it.each([{...body,version:'old'},{...body,items:[{...item,amountCents:-1}]}])('requires a current exact snapshot for no-receipt assertions',async input=>{
  expect((await send(input)).status).toBe(409);expect(m.rpc).not.toHaveBeenCalled()
 })
 it('permits owned uploaded evidence to resolve the former projection before acknowledgment',async()=>{
  m.work.mockResolvedValue({actions:[]})
  expect((await send({...body,response:'provided',documentIds:[doc]})).status).toBe(200)
  expect(m.work).not.toHaveBeenCalled()
  expect(m.rpc).toHaveBeenCalledWith('answer_betti_evidence_opportunity',expect.objectContaining({p_document_ids:[doc]}))
 })
 it('leaves ownership and retry conflicts fail-closed in the durable database operation',async()=>{
  m.prior.mockResolvedValue({data:{id:body.requestId}});m.rpc.mockResolvedValue({error:{message:'conflict'}})
  expect((await send()).status).toBe(409);expect(m.work).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledOnce()
 })
})
