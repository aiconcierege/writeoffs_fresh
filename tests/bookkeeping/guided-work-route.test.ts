import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({user:vi.fn(),prior:vi.fn(),rpc:vi.fn(),work:vi.fn(),capability:vi.fn()}))
vi.mock('../../utils/supabase/server',()=>({createServerSupabase:async()=>({auth:{getUser:m.user},rpc:m.rpc,from:()=>({select:()=>({eq:()=>({maybeSingle:m.prior})})})})}))
vi.mock('../../app/lib/bookkeeping/customer-work',()=>({loadCurrentCustomerWork:m.work}))
vi.mock('../../app/lib/membership/entitlements',()=>({requireCapability:m.capability,membershipErrorResponse:()=>({error:'Membership required',status:403})}))
import {POST} from '../../app/api/bookkeeping/work/answer/route'
const item={recordId:'record',decisionId:'decision',reviewVersion:'evidence',accountUseVersion:'account',merchant:'Store',date:'2026-08-12',amountCents:-10000,transactionId:'source'}
const body={actionId:'guided:owned',version:'version1',requestId:'11111111-1111-4111-8111-111111111111',disposition:'completed',items:[item],answers:{}}
const send=(value:unknown=body)=>POST(new Request('http://localhost/api/bookkeeping/work/answer',{method:'POST',body:JSON.stringify(value)}))
beforeEach(()=>{vi.clearAllMocks();m.user.mockResolvedValue({data:{user:{id:'owner'}}});m.prior.mockResolvedValue({data:null});m.rpc.mockResolvedValue({data:[],error:null});m.capability.mockResolvedValue({});m.work.mockResolvedValue({actions:[{id:body.actionId,version:body.version,type:'receipt_availability',items:[item]}]})})
describe('guided answer API boundary',()=>{
 it('requires authentication and mutation capability',async()=>{m.user.mockResolvedValueOnce({data:{user:null}});expect((await send()).status).toBe(401);m.capability.mockRejectedValueOnce(new Error());expect((await send()).status).toBe(403);expect(m.rpc).not.toHaveBeenCalled()})
 it('uses only the current canonical projected visible snapshot',async()=>{expect((await send()).status).toBe(200);expect(m.rpc).toHaveBeenCalledWith('answer_betti_guided_work',expect.objectContaining({p_items:[item],p_action:'receipt_availability',p_disposition:'completed'}))})
 it.each([{...body,version:'stale'},{...body,actionId:'foreign'},{...body,items:[{...item,recordId:'unseen'}]}])('rejects stale, foreign or unseen selections before mutation',async value=>{expect((await send(value)).status).toBe(409);expect(m.rpc).not.toHaveBeenCalled()})
 it('does not accept waiting work as a customer action',async()=>{m.work.mockResolvedValue({actions:[]});expect((await send()).status).toBe(409);expect(m.rpc).not.toHaveBeenCalled()})
 it('retries an existing assertion through its canonical payload equality check',async()=>{m.prior.mockResolvedValue({data:{action:'receipt_availability'}});expect((await send()).status).toBe(200);expect(m.work).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledTimes(1)})
 it('keeps deferral distinct from a completed receipt assertion',async()=>{expect((await send({...body,disposition:'deferred'})).status).toBe(200);expect(m.rpc).toHaveBeenCalledWith('answer_betti_guided_work',expect.objectContaining({p_disposition:'deferred'}))})
 it('accepts identical JSONB item fields regardless of object-key serialization order',async()=>{
  const reordered=Object.fromEntries(Object.entries(item).reverse())
  expect((await send({...body,items:[reordered]})).status).toBe(200)
  expect(m.rpc).toHaveBeenCalledTimes(1)
 })
 it.each([{...item,amountCents:-10001},{...item,reviewVersion:'changed'},{...item,extra:'unseen'}])('still rejects changed fields or added content',async changed=>{
  expect((await send({...body,items:[changed]})).status).toBe(409);expect(m.rpc).not.toHaveBeenCalled()
 })
 it('keeps receipt groups bounded at eight',async()=>{m.work.mockResolvedValue({actions:[{id:body.actionId,version:body.version,type:'receipt_availability',items:Array(9).fill(item)}]});expect((await send({...body,items:Array(9).fill(item)})).status).toBe(400);expect(m.rpc).not.toHaveBeenCalled()})
 it('accepts a coherent 20-purchase personal review using the exact projected snapshot',async()=>{const items=Array.from({length:20},(_,i)=>({...item,recordId:`record-${i}`}));m.work.mockResolvedValue({actions:[{id:body.actionId,version:body.version,type:'personal_exception_sweep',items}]});expect((await send({...body,items})).status).toBe(200);expect(m.rpc).toHaveBeenCalledWith('answer_betti_guided_work',expect.objectContaining({p_items:items,p_action:'personal_exception_sweep'}))})
 it('rejects oversized groups',async()=>{expect((await send({...body,items:Array(101).fill(item)})).status).toBe(400);expect(m.rpc).not.toHaveBeenCalled()})
})
