import{beforeEach,describe,it,expect,vi}from'vitest'
const m=vi.hoisted(()=>({auth:vi.fn(),capability:vi.fn(),rpc:vi.fn(),after:vi.fn(),drain:vi.fn(),info:vi.fn()}))
vi.mock('next/server',async original=>({...await original<typeof import('next/server')>(),after:m.after}))
vi.mock('../../utils/supabase/server',()=>({createServerSupabase:async()=>({auth:{getUser:m.auth},rpc:m.rpc,storage:{from:()=>({info:m.info})}})}))
vi.mock('../../app/lib/membership/entitlements',()=>({requireCapability:m.capability,membershipErrorResponse:()=>({status:403,error:'membership_required'})}))
vi.mock('../../app/lib/documents/durable-processing',()=>({drainCanonicalDocumentJobs:m.drain}))
import{POST}from'../../app/api/documents/route'
const body={id:'11111111-2222-4333-8444-555555555555',fingerprint:'a'.repeat(64),name:'activity.pdf',mime:'application/pdf',bytes:2500}
const request=(b:unknown=body)=>new Request('https://example.test/api/documents',{method:'POST',body:JSON.stringify(b)})
beforeEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();m.auth.mockResolvedValue({data:{user:{id:'owner'}}});m.capability.mockResolvedValue(undefined);m.rpc.mockResolvedValue({data:{id:body.id},error:null});m.info.mockResolvedValue({data:{size:2500},error:null})})
describe('unified document registration',()=>{
 it('uses owner-resolving registration and wakes only its returned document',async()=>{expect((await POST(request())).status).toBe(200);expect(m.rpc).toHaveBeenCalledWith('register_customer_document',expect.not.objectContaining({businessId:expect.anything()}));await m.after.mock.calls[0][0]();expect(m.drain).toHaveBeenCalledWith({documentId:body.id})})
 it('rejects client tenant authority without registering',async()=>{expect((await POST(request({...body,businessId:'someone-else'}))).status).toBe(400);expect(m.rpc).not.toHaveBeenCalled()})
 it('enforces membership and authentication',async()=>{m.capability.mockRejectedValueOnce(Error());expect((await POST(request())).status).toBe(403);m.auth.mockResolvedValue({data:{user:null}});expect((await POST(request())).status).toBe(401);expect(m.rpc).not.toHaveBeenCalled()})
 it('reports paused processing truthfully and avoids worker invocation',async()=>{vi.stubEnv('DOCUMENT_EXPENSIVE_PROCESSING_ENABLED','false');const r=await POST(request());expect((await r.json()).processingPaused).toBe(true);expect(m.after).not.toHaveBeenCalled()})
 it('fails safely on invalid metadata and registration errors',async()=>{expect((await POST(request({...body,bytes:21*1024*1024}))).status).toBe(400);m.rpc.mockResolvedValue({data:null,error:{message:'private database details'}});const r=await POST(request());expect(r.status).toBe(400);expect(await r.text()).not.toContain('private database details')})
})
