import{beforeEach,describe,expect,it,vi}from'vitest'

const rpc=vi.fn()
const getUser=vi.fn(async()=>({data:{user:{id:'owner'}},error:null}))
const paymentId='11111111-1111-4111-8111-111111111111'

vi.mock('../../utils/supabase/server',()=>({createServerSupabase:vi.fn(async()=>({auth:{getUser,mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:"aal2"}})}},rpc,
  from:vi.fn((table:string)=>({select:vi.fn(()=>({eq:vi.fn(()=>({maybeSingle:vi.fn(async()=>({
    data:table==='current_contractor_payments'?{id:paymentId}:null,error:null}))}))}))}))}))}))
vi.mock('../../app/lib/bookkeeping/customer-work',()=>({loadCurrentCustomerWork:async()=>({questions:[{id:paymentId,version:paymentId}]})}))
vi.mock('../../utils/supabase/admin',()=>({createServerAdminSupabase:vi.fn()}))
vi.mock('../../app/lib/bookkeeping/customer-question-actions',()=>({actOnCustomerQuestion:vi.fn()}))
vi.mock('../../app/lib/bookkeeping/evaluation-snapshot',()=>({loadBookkeepingEvaluationSnapshot:vi.fn()}))
vi.mock('../../app/lib/bookkeeping/deduction-intelligence',()=>({runDeductionIntelligenceForRecord:vi.fn()}))

describe('contractor question deferral route',()=>{
  beforeEach(()=>{vi.clearAllMocks();rpc.mockResolvedValue({data:'defer-event',error:null})})
  it('persists a version-bound deferral instead of reporting an empty success',async()=>{
    const route=await import('../../app/api/bookkeeping/questions/[id]/route')
    const response=await route.POST(new Request('http://local',{method:'POST',
      headers:{'content-type':'application/json','if-match':paymentId},body:JSON.stringify({action:'defer'})}),
      {params:Promise.resolve({id:paymentId})})
    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('defer_contractor_question',expect.objectContaining({
      p_question_source:'payment_method',p_question_id:paymentId,p_expected_source_version_id:paymentId,
    }))
  })
  it('fails closed when durable persistence fails',async()=>{
    rpc.mockResolvedValue({data:null,error:{message:'contractor question changed'}})
    const route=await import('../../app/api/bookkeeping/questions/[id]/route')
    const response=await route.POST(new Request('http://local',{method:'POST',
      headers:{'content-type':'application/json','if-match':paymentId},body:JSON.stringify({action:'defer'})}),
      {params:Promise.resolve({id:paymentId})})
    expect(response.status).toBe(409)
  })
})
