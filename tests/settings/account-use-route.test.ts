import { beforeEach,describe,expect,it,vi } from 'vitest'

const getUser=vi.fn(),rpc=vi.fn()
vi.mock('../../utils/supabase/server',()=>({createServerSupabase:async()=>({auth:{getUser},rpc})}))
import { POST } from '../../app/api/bookkeeping/accounts/[id]/use/route'

const accountId='11111111-1111-4111-8111-111111111111'
const requestId='22222222-2222-4222-8222-222222222222'
const request=(body:unknown)=>new Request(`https://example.test/api/bookkeeping/accounts/${accountId}/use`,{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),
})

describe('account-use route',()=>{
  beforeEach(()=>{vi.clearAllMocks();getUser.mockResolvedValue({data:{user:{id:'user'}}});rpc.mockResolvedValue({data:'event',error:null})})

  it('requires authentication',async()=>{
    getUser.mockResolvedValue({data:{user:null}})
    expect((await POST(request({}),{params:Promise.resolve({id:accountId})})).status).toBe(401)
  })

  it('passes only validated customer facts to the canonical RPC',async()=>{
    const effectiveAt='2026-09-08T12:00:00.000Z'
    const response=await POST(request({designation:'business_only',effectiveAt,requestId}),
      {params:Promise.resolve({id:accountId})})
    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('set_financial_account_use',{p_financial_account_id:accountId,
      p_designation:'business_only',p_effective_at:effectiveAt,p_request_id:requestId})
  })

  it.each(['personal','business','mixed',null])('rejects unsupported designation %s',async(designation)=>{
    expect((await POST(request({designation,effectiveAt:new Date().toISOString(),requestId}),
      {params:Promise.resolve({id:accountId})})).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns a calm error without exposing database details',async()=>{
    rpc.mockResolvedValue({data:null,error:{message:'sensitive database detail'}})
    const response=await POST(request({designation:'business_and_personal',effectiveAt:new Date().toISOString(),requestId}),
      {params:Promise.resolve({id:accountId})})
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({error:'The account use could not be saved.'})
  })
})
