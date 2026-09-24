import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTION_INDEX_VERSION } from '../../app/lib/bookkeeping/action-index-model'

const getUser = vi.fn()
const assurance = vi.fn()
const maybeSingle = vi.fn()
const rpc = vi.fn()
const decisionHistory = vi.fn()
const applyFact = vi.fn()
const getCurrentAskableQuestionQueue = vi.fn()
const actOnCustomerQuestion = vi.fn()
const indexEnabled = vi.fn(() => false)
const indexedQuestion = vi.fn()
const queuedReassessment=vi.fn(),finishExpense=vi.fn(),scheduleAfter=vi.fn()
vi.mock('../../app/lib/bookkeeping/queued-answer-reassessment',()=>({hasQueuedAnswerReassessment:queuedReassessment}))
vi.mock('../../app/lib/bookkeeping/answered-expense-classification',()=>({finishAnsweredExpense:finishExpense}))
vi.mock('next/server',async original=>({...await original<typeof import('next/server')>(),after:scheduleAfter}))
vi.mock('../../app/lib/bookkeeping/action-index-worker',()=>({actionIndexEnabled:indexEnabled,refreshBettiActionIndex:vi.fn()}))
vi.mock('../../app/lib/bookkeeping/indexed-question-command',()=>({readIndexedQuestion:indexedQuestion,indexedQuestionClient:vi.fn()}))

vi.mock('../../utils/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser, mfa:{getAuthenticatorAssuranceLevel:assurance} }, rpc,
    from: vi.fn((table:string) => {
      if(table==='bookkeeping_decisions'){const q={eq:()=>q,limit:decisionHistory};return {select:()=>q}}
      return {select:vi.fn(()=>({eq:vi.fn(()=>({maybeSingle}))}))}
    }),
  })),
}))
vi.mock('../../app/lib/bookkeeping/customer-work', () => ({ loadCurrentCustomerWork:getCurrentAskableQuestionQueue }))
vi.mock('../../app/lib/bookkeeping/customer-question-actions', () => ({ actOnCustomerQuestion }))
vi.mock('../../app/lib/membership/entitlements',()=>({loadCustomerEntitlements:vi.fn(async()=>({plan:'business',businessId:'owned-business',capabilities:new Set(['autonomous_processing'])}))}))

vi.mock('../../utils/supabase/admin',()=>({createServerAdminSupabase:vi.fn(()=>({rpc}))}))
vi.mock('../../app/lib/bookkeeping/deduction-intelligence',()=>({runDeductionIntelligenceForRecord:applyFact}))
vi.mock('../../app/lib/bookkeeping/evaluation-snapshot',()=>({loadBookkeepingEvaluationSnapshot:vi.fn(async()=>({}))}))

const issueId = '11111111-1111-4111-8111-111111111111'
const eventId = '22222222-2222-4222-8222-222222222222'

describe('customer question API', () => {
  beforeEach(() => {
    vi.clearAllMocks();vi.unstubAllEnvs()
    queuedReassessment.mockResolvedValue(false);finishExpense.mockResolvedValue(undefined)
    decisionHistory.mockResolvedValue({data:[{id:'customer-decision'}],error:null})
    indexEnabled.mockReturnValue(false)
    indexedQuestion.mockResolvedValue({initialized:true,action:null,commandItem:null})
    assurance.mockResolvedValue({data:{currentLevel:"aal2"}})
    maybeSingle.mockResolvedValue({data:null})
    rpc.mockResolvedValue({error:null})
    applyFact.mockResolvedValue({outcome:'already_applied'})
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    getCurrentAskableQuestionQueue.mockResolvedValue({
      asOf:'2026-09-08T12:00:00.000Z',count:1,oldestOutstandingAt:'2026-09-07T12:00:00.000Z',
      questions:[{ id: issueId, version:eventId }],
    })
    actOnCustomerQuestion.mockResolvedValue({})
  })


  it.each([true,false])('uses the exact durable-job proof on a dirty-index fallback (%s)',async queued=>{
    indexEnabled.mockReturnValue(true);queuedReassessment.mockResolvedValue(queued)
    getCurrentAskableQuestionQueue.mockImplementationOnce(async({onSnapshot})=>{onSnapshot({businessId:'owned-business'});return {questions:[{id:issueId,version:eventId}]}})
    const result={decision:{id:'saved',businessId:'owned-business',bookkeepingRecordId:'record',bookkeepingNature:'expense'}}
    actOnCustomerQuestion.mockResolvedValue(result)
    if(queued)finishExpense.mockImplementation(()=>new Promise(()=>{}))
    const route=await import('../../app/api/bookkeeping/questions/[id]/route')
    const response=await route.POST(new Request('https://local/answer',{method:'POST',headers:{'if-match':eventId},body:JSON.stringify({action:'business_purpose',businessPurpose:'Business insurance'})}),{params:Promise.resolve({id:issueId})})
    expect(response.status).toBe(200)
    expect(queuedReassessment).toHaveBeenCalledWith(expect.objectContaining({businessId:'owned-business',result}))
    expect(finishExpense).toHaveBeenCalledTimes(queued?0:1)
    expect(scheduleAfter).toHaveBeenCalledTimes(queued?1:0)
    if(queued){finishExpense.mockResolvedValue(undefined);await scheduleAfter.mock.calls[0][0]();expect(finishExpense).toHaveBeenCalledWith(expect.objectContaining({result}))}
  })

  it('keeps category and tax reassessment synchronous while processing is paused',async()=>{
    vi.stubEnv('DOCUMENT_EXPENSIVE_PROCESSING_ENABLED','false');indexEnabled.mockReturnValue(true)
    getCurrentAskableQuestionQueue.mockImplementationOnce(async({onSnapshot})=>{onSnapshot({businessId:'owned-business'});return {questions:[{id:issueId,version:eventId}]}})
    const route=await import('../../app/api/bookkeeping/questions/[id]/route')
    const response=await route.POST(new Request('https://local/answer',{method:'POST',headers:{'if-match':eventId},body:JSON.stringify({action:'business_purpose',businessPurpose:'Business insurance'})}),{params:Promise.resolve({id:issueId})})
    expect(response.status).toBe(200);expect(queuedReassessment).not.toHaveBeenCalled();expect(scheduleAfter).not.toHaveBeenCalled()
    expect(finishExpense).toHaveBeenCalledWith(expect.objectContaining({deferQueuedTaxReassessment:false}))
    vi.unstubAllEnvs()
  })

  it('rejects AAL1 before any eligibility read or write',async()=>{
    assurance.mockResolvedValue({data:{currentLevel:'aal1'}})
    const route=await import('../../app/api/bookkeeping/questions/[id]/route')
    const response=await route.POST(new Request('https://local/answer',{method:'POST',headers:{'if-match':eventId},body:JSON.stringify({action:'defer'})}),{params:Promise.resolve({id:issueId})})
    expect(response.status).toBe(403)
    expect(getCurrentAskableQuestionQueue).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(actOnCustomerQuestion).not.toHaveBeenCalled()
  })

  it.each([80,50])('retries only the same committed factual answer (%s)',async value=>{
    maybeSingle.mockResolvedValue({data:{id:issueId,attention_id:issueId,event_type:'answered',
      supersedes_event_id:eventId,answer_value:80,fact_type:'phone_business_use_percentage',
      bookkeeping_record_id:'record',business_id:'owned-business'}})
    const route=await import('../../app/api/bookkeeping/questions/[id]/route')
    const response=await route.POST(new Request('http://local',{method:'POST',
      headers:{'content-type':'application/json','if-match':eventId},
      body:JSON.stringify({action:'deduction_fact',value})}),{params:Promise.resolve({id:issueId})})
    expect(response.status).toBe(value===80?200:409)
    expect(rpc).not.toHaveBeenCalledWith('answer_deduction_attention',expect.anything())
    expect(applyFact).toHaveBeenCalledTimes(value===80?1:0)
  })

  it('verifies a committed answer after an uncertain RPC response',async()=>{
    const attention={id:eventId,attention_id:issueId,event_type:'opened',fact_type:'phone_business_use_percentage',
      bookkeeping_record_id:'record',business_id:'owned-business'}
    maybeSingle.mockResolvedValueOnce({data:attention}).mockResolvedValueOnce({data:{...attention,id:issueId,
      event_type:'answered',supersedes_event_id:eventId,answer_value:80}})
    rpc.mockResolvedValueOnce({error:{message:'deduction question changed'}})
    const route=await import('../../app/api/bookkeeping/questions/[id]/route')
    const response=await route.POST(new Request('http://local',{method:'POST',
      headers:{'content-type':'application/json','if-match':eventId},body:JSON.stringify({action:'deduction_fact',value:80})}),
      {params:Promise.resolve({id:issueId})})
    expect(response.status).toBe(200);expect(applyFact).toHaveBeenCalledTimes(1)
  })

  it('acknowledges an ordinary service allocation after durable persistence without synchronous reassessment',async()=>{
    decisionHistory.mockResolvedValue({data:[],error:null})
    maybeSingle.mockResolvedValue({data:{id:eventId,attention_id:issueId,event_type:'opened',fact_type:'phone_business_use_percentage',bookkeeping_record_id:'record',business_id:'owned-business'}})
    const route=await import('../../app/api/bookkeeping/questions/[id]/route')
    const response=await route.POST(new Request('http://local',{method:'POST',headers:{'if-match':eventId},body:JSON.stringify({action:'deduction_fact',value:60})}),{params:Promise.resolve({id:issueId})})
    expect(response.status).toBe(200);expect(rpc).toHaveBeenCalledWith('answer_deduction_attention',expect.objectContaining({p_value:60}));expect(applyFact).not.toHaveBeenCalled()
  })

  it.each([true,false])('uses only a current-version, authoritative indexed allocation question (%s)',async current=>{
    indexEnabled.mockReturnValue(true);decisionHistory.mockResolvedValue({data:[],error:null})
    indexedQuestion.mockResolvedValue({initialized:true,engineVersion:current?ACTION_INDEX_VERSION:'old',commandItem:null,
      action:{status:'actionable',question:{id:issueId,version:eventId,source:'deduction',kind:'percentage',deductionFact:{type:'phone_business_use_percentage'}}}})
    maybeSingle.mockResolvedValue({data:{id:eventId,attention_id:issueId,event_type:'opened',fact_type:'phone_business_use_percentage',bookkeeping_record_id:'record',business_id:'owned-business'}})
    const route=await import('../../app/api/bookkeeping/questions/[id]/route')
    const response=await route.POST(new Request('http://local',{method:'POST',headers:{'if-match':eventId},body:JSON.stringify({action:'deduction_fact',value:60})}),{params:Promise.resolve({id:issueId})})
    expect(response.status).toBe(200);expect(getCurrentAskableQuestionQueue).toHaveBeenCalledTimes(current?0:1)
    expect(rpc).toHaveBeenCalledWith('answer_deduction_attention',expect.objectContaining({p_expected_event_id:eventId}))
  })

  it('rejects unauthenticated queue and answer access', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const queue = await import('../../app/api/bookkeeping/questions/route')
    const action = await import('../../app/api/bookkeeping/questions/[id]/route')
    expect((await queue.GET()).status).toBe(401)
    const response = await action.POST(new Request('http://local', {
      method: 'POST', headers: { 'content-type': 'application/json', 'if-match': eventId },
      body: JSON.stringify({ action: 'defer' }),
    }), { params: Promise.resolve({ id: issueId }) })
    expect(response.status).toBe(401)
    expect(actOnCustomerQuestion).not.toHaveBeenCalled()
  })

  it('returns the tenant-scoped actionable count', async () => {
    const route = await import('../../app/api/bookkeeping/questions/route')
    const response = await route.GET()
    expect(await response.json()).toEqual({asOf:'2026-09-08T12:00:00.000Z',questions:[{id:issueId,version:eventId}],count:1,
      oldestOutstandingAt:'2026-09-07T12:00:00.000Z'})
  })

  it.each([
    [{ action: 'business_use', use: 'business' }],
    [{ action: 'business_use', use: 'personal' }],
    [{ action: 'not_sure' }],
    [{ action: 'business_purpose', businessPurpose: 'Client lunch' }],
    [{ action: 'mixed_all_business' }],
    [{ action: 'mixed_business_amount', businessAmountCents: 12000 }],
    [{ action: 'mixed_personal_amount', personalAmountCents: 6600 }],
    [{ action: 'factual_choice', optionId: 'bank_amount' }],
    [{ action: 'defer' }],
  ])('accepts the narrow factual action %j', async (command) => {
    const route = await import('../../app/api/bookkeeping/questions/[id]/route')
    const response = await route.POST(new Request('http://local', {
      method: 'POST', headers: { 'content-type': 'application/json', 'if-match': eventId },
      body: JSON.stringify(command),
    }), { params: Promise.resolve({ id: issueId }) })
    expect(response.status).toBe(200)
    expect(actOnCustomerQuestion).toHaveBeenCalledWith(expect.objectContaining({
      issueId, expectedEventId: eventId, command,
    }))
  })

  it('rejects caller-supplied bookkeeping and tenant fields', async () => {
    const route = await import('../../app/api/bookkeeping/questions/[id]/route')
    const response = await route.POST(new Request('http://local', {
      method: 'POST', headers: { 'content-type': 'application/json', 'if-match': eventId },
      body: JSON.stringify({ action: 'business_use', use: 'business', businessId: 'other', category: 'meals' }),
    }), { params: Promise.resolve({ id: issueId }) })
    expect(response.status).toBe(400)
    expect(actOnCustomerQuestion).not.toHaveBeenCalled()
  })

  it('does not expose canonical database errors to the customer', async () => {
    actOnCustomerQuestion.mockRejectedValue(new Error(
      'current bookkeeping decision violated an internal allocation constraint'
    ))
    const route = await import('../../app/api/bookkeeping/questions/[id]/route')
    const response = await route.POST(new Request('http://local', {
      method: 'POST', headers: { 'content-type': 'application/json', 'if-match': eventId },
      body: JSON.stringify({ action: 'not_sure' }),
    }), { params: Promise.resolve({ id: issueId }) })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'We couldn’t save that answer. Please check it and try again.',
    })
  })
  it('rejects an out-of-scope or prerequisite-blocked question before any answer mutation',async()=>{
    getCurrentAskableQuestionQueue.mockResolvedValue({questions:[],count:0})
    const route=await import('../../app/api/bookkeeping/questions/[id]/route')
    const response=await route.POST(new Request('http://local',{method:'POST',headers:{'content-type':'application/json','if-match':eventId},body:JSON.stringify({action:'business_use',use:'business'})}),{params:Promise.resolve({id:issueId})})
    expect(response.status).toBe(409);expect(actOnCustomerQuestion).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled()
  })
  it('allows an identical committed deduction retry after the question leaves the active projection',async()=>{
    getCurrentAskableQuestionQueue.mockResolvedValue({questions:[],count:0})
    maybeSingle.mockResolvedValue({data:{id:issueId,attention_id:issueId,event_type:'answered',supersedes_event_id:eventId,answer_value:80,fact_type:'phone_business_use_percentage',bookkeeping_record_id:'record',business_id:'owned-business'}})
    const route=await import('../../app/api/bookkeeping/questions/[id]/route')
    const response=await route.POST(new Request('http://local',{method:'POST',headers:{'content-type':'application/json','if-match':eventId},body:JSON.stringify({action:'deduction_fact',value:80})}),{params:Promise.resolve({id:issueId})})
    expect(response.status).toBe(200);expect(rpc).not.toHaveBeenCalledWith('answer_deduction_attention',expect.anything())
  })

  it('accepts a canonically current question while the derived index is refreshing',async()=>{
    indexEnabled.mockReturnValue(true)
    const route=await import('../../app/api/bookkeeping/questions/[id]/route')
    const response=await route.POST(new Request('https://local/answer',{method:'POST',headers:{'if-match':eventId},
      body:JSON.stringify({action:'transaction_type',activity:'purchase'})}),{params:Promise.resolve({id:issueId})})
    expect(response.status).toBe(200)
    expect(indexedQuestion).toHaveBeenCalledWith(expect.anything(),'owned-business',issueId,eventId)
    expect(getCurrentAskableQuestionQueue).toHaveBeenCalledWith(expect.objectContaining({onSnapshot:expect.any(Function)}))
    expect(actOnCustomerQuestion).toHaveBeenCalledWith(expect.objectContaining({issueId,expectedEventId:eventId}))
  })
  it.each([{questions:[]},{questions:[{id:issueId,version:'different-event'}]}])('does not use an index miss to bypass canonical eligibility/version validation',async ({questions})=>{
    indexEnabled.mockReturnValue(true)
    getCurrentAskableQuestionQueue.mockResolvedValue({questions,count:questions.length})
    const route=await import('../../app/api/bookkeeping/questions/[id]/route')
    const response=await route.POST(new Request('https://local/answer',{method:'POST',headers:{'if-match':eventId},
      body:JSON.stringify({action:'transaction_type',activity:'purchase'})}),{params:Promise.resolve({id:issueId})})
    expect(response.status).toBe(409)
    expect(actOnCustomerQuestion).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

})
