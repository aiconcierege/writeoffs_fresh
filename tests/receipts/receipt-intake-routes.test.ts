import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({auth:vi.fn(),capability:vi.fn(),register:vi.fn(),after:vi.fn(),drain:vi.fn(),owner:vi.fn(),from:vi.fn(),admin:vi.fn()}))
vi.mock('next/server',async importOriginal=>({...await importOriginal<typeof import('next/server')>(),after:m.after}))
vi.mock('../../utils/supabase/server',()=>({createServerSupabase:async()=>({auth:{getUser:m.auth},from:m.from})}))
vi.mock('../../utils/supabase/admin',()=>({createServerAdminSupabase:m.admin}))
vi.mock('../../app/lib/membership/entitlements',()=>({requireCapability:m.capability,membershipErrorResponse:()=>({status:403,error:'membership_required'})}))
vi.mock('../../app/lib/bookkeeping/receipt-workflow',()=>({registerReceipt:m.register,requireReceiptOwner:m.owner,listCanonicalReceipts:vi.fn()}))
vi.mock('../../app/lib/documents/durable-processing',()=>({drainCanonicalDocumentJobs:m.drain}))
import {POST as upload} from '../../app/api/receipts/route'
import {POST as retry} from '../../app/api/receipts/[id]/retry/route'
const id='11111111-2222-4333-8444-555555555555'
const body={id,uploadFingerprint:'a'.repeat(64),storagePath:'receipts/user/fingerprint',originalName:'receipt.png',mimeType:'image/png',bytes:1200}
const request=(value:unknown=body)=>new Request('https://example.test/api/receipts',{method:'POST',body:JSON.stringify(value)})
beforeEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();m.auth.mockResolvedValue({data:{user:{id:'owner-a'}}});m.capability.mockResolvedValue(undefined);m.register.mockResolvedValue({id});m.owner.mockResolvedValue({user:{id:'owner-a'},businessId:'business-a'})})
describe('receipt intake and owner-scoped wake-up',()=>{
 it('accepts PNG metadata and wakes only the canonically registered receipt after responding',async()=>{
  const response=await upload(request());expect(response.status).toBe(200);expect(m.register).toHaveBeenCalledWith(expect.objectContaining(body));expect(m.after).toHaveBeenCalledTimes(1)
  await m.after.mock.calls[0][0]();expect(m.drain).toHaveBeenCalledWith({receiptId:id,batchSize:1})
 })
 it('retains uploads without invoking providers when processing is deliberately paused',async()=>{
  vi.stubEnv('DOCUMENT_EXPENSIVE_PROCESSING_ENABLED','false');expect((await upload(request())).status).toBe(200);expect(m.after).not.toHaveBeenCalled();vi.unstubAllEnvs()
 })
 it('rejects tenant authority in metadata and enforces membership/authentication',async()=>{
  expect((await upload(request({...body,businessId:'tenant-b'}))).status).toBe(400);expect(m.register).not.toHaveBeenCalled()
  m.capability.mockRejectedValueOnce(Error());expect((await upload(request())).status).toBe(403)
  m.auth.mockResolvedValue({data:{user:null}});expect((await upload(request())).status).toBe(401)
 })
 it('never uses trusted worker access for another tenant receipt',async()=>{
  const query={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:null,error:null})};query.select.mockReturnValue(query);query.eq.mockReturnValue(query);m.from.mockReturnValue(query)
  expect((await retry(request(),{params:Promise.resolve({id})})).status).toBe(404)
  expect(query.eq).toHaveBeenCalledWith('business_id','business-a');expect(query.eq).toHaveBeenCalledWith('user_id','owner-a');expect(m.admin).not.toHaveBeenCalled();expect(m.after).not.toHaveBeenCalled()
 })
})
