import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({auth:vi.fn(),capability:vi.fn(),owner:vi.fn(),rpc:vi.fn(),after:vi.fn(),drain:vi.fn(),single:vi.fn(),eq:vi.fn()}))
vi.mock('next/server',async original=>({...await original<typeof import('next/server')>(),after:m.after}))
vi.mock('../../utils/supabase/server',()=>({createServerSupabase:async()=>({auth:{getUser:m.auth},rpc:m.rpc,from:()=>({select:()=>({eq:m.eq})})})}))
vi.mock('../../app/lib/membership/entitlements',()=>({requireCapability:m.capability,membershipErrorResponse:()=>({status:403,error:'membership_required'})}))
vi.mock('../../app/lib/bookkeeping/receipt-workflow',()=>({requireReceiptOwner:m.owner}))
vi.mock('../../app/lib/documents/durable-processing',()=>({drainCanonicalDocumentJobs:m.drain}))
import {POST} from '../../app/api/receipts/[id]/route-document/route'
const id='11111111-2222-4333-8444-555555555555'
const call=()=>POST(new Request('https://example.test/recover',{method:'POST',body:JSON.stringify({businessId:'other',bytes:1})}),{params:Promise.resolve({id})})
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({data:{user:{id:'owner'}}});m.owner.mockResolvedValue({businessId:'owned-business'});m.capability.mockResolvedValue(undefined);m.eq.mockImplementation(()=>({eq:m.eq,maybeSingle:m.single}));m.single.mockResolvedValue({data:{id,upload_fingerprint:'a'.repeat(64),original_name:'document.pdf',mime_type:'application/pdf',bytes:1234},error:null});m.rpc.mockResolvedValue({data:{id:'document-id'},error:null})})
describe('owned receipt to document recovery',()=>{
 it('uses stored evidence metadata and checks both business and actor',async()=>{expect((await call()).status).toBe(200);expect(m.eq).toHaveBeenCalledWith('business_id','owned-business');expect(m.eq).toHaveBeenCalledWith('user_id','owner');expect(m.rpc).toHaveBeenCalledWith('register_customer_document',expect.objectContaining({p_bytes:1234,p_fingerprint:'a'.repeat(64)}));await m.after.mock.calls[0][0]();expect(m.drain).toHaveBeenCalledWith({documentId:'document-id'})})
 it('cannot route another tenant’s receipt',async()=>{m.single.mockResolvedValue({data:null,error:null});expect((await call()).status).toBe(404);expect(m.rpc).not.toHaveBeenCalled();expect(m.after).not.toHaveBeenCalled()})
 it('preserves membership and authentication enforcement',async()=>{m.capability.mockRejectedValueOnce(Error());expect((await call()).status).toBe(403);m.auth.mockResolvedValue({data:{user:null}});expect((await call()).status).toBe(401);expect(m.rpc).not.toHaveBeenCalled()})
})
