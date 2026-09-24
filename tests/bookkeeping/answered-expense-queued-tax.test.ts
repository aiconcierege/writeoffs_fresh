import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({load:vi.fn(),record:vi.fn(),process:vi.fn(),queued:vi.fn()}))
vi.mock('../../app/lib/bookkeeping/evaluation-snapshot',()=>({loadBookkeepingEvaluationSnapshot:mocks.load}))
vi.mock('../../app/lib/bookkeeping/service',()=>({CanonicalBookkeepingService:class{recordDecision=mocks.record}}))
vi.mock('../../app/lib/bookkeeping/operating-expense-processing',()=>({processOperatingExpenseTreatment:mocks.process}))
vi.mock('../../app/lib/bookkeeping/queued-answer-reassessment',()=>({hasQueuedAnswerReassessment:mocks.queued}))
import {finishAnsweredExpense} from '../../app/lib/bookkeeping/answered-expense-classification'
function fixture(){
 const decision={id:'answer',businessId:'business',bookkeepingRecordId:'record',provenance:'user',bookkeepingNature:'expense',treatment:'business',reviewStatus:'resolved',businessPurpose:'Business insurance',allocations:[{kind:'business',amountCents:-10000,taxCategoryKey:null}]}
 const snapshot={businessId:'business',recordId:'record',amountCents:-10000,currency:'USD',occurredOn:'2026-05-01',merchantName:'Adobe software subscription',description:'Monthly software subscription',businessDescription:'Design consulting',activeDocumentCount:0,customerAnswerCount:1,hasOpenConflictingEvidence:false,decisionHistoryLength:2,movement:null,movementCandidates:[],currentDecision:decision}
 const categorized={...decision,id:'categorized',allocations:[{kind:'business',amountCents:-10000,taxCategoryKey:'software'}]}
 const q={eq:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:{id:'record'},error:null})};q.eq.mockReturnValue(q)
 const supabase={auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'owner'}}})},from:vi.fn().mockReturnValue({select:()=>q})}
 const admin={from:vi.fn()}
 mocks.load.mockResolvedValueOnce(snapshot).mockResolvedValue({...snapshot,currentDecision:categorized})
 mocks.record.mockResolvedValue(categorized);mocks.queued.mockResolvedValue(true)
 return {supabase:supabase as never,admin:admin as never,result:{decision},categorized}
}
beforeEach(()=>vi.resetAllMocks())
describe('durable category before deferred tax reassessment',()=>{
 it('commits the category first and requires a queued dependency for that new decision',async()=>{
  const f=fixture();expect(await finishAnsweredExpense({...f,deferQueuedTaxReassessment:true})).toBe(true)
  expect(mocks.record).toHaveBeenCalledOnce();expect(mocks.queued).toHaveBeenCalledWith({admin:f.admin,businessId:'business',result:{decision:f.categorized}})
  expect(mocks.record.mock.invocationCallOrder[0]).toBeLessThan(mocks.queued.mock.invocationCallOrder[0])
  expect(mocks.load).toHaveBeenCalledOnce();expect(mocks.process).not.toHaveBeenCalled()
 })
 it('keeps reassessment synchronous if exact-decision queue proof fails',async()=>{
  const f=fixture();mocks.queued.mockResolvedValue(false)
  await finishAnsweredExpense({...f,deferQueuedTaxReassessment:true})
  expect(mocks.load).toHaveBeenCalledTimes(2);expect(mocks.process).toHaveBeenCalledOnce()
 })
 it('retains the original default synchronous behavior',async()=>{
  await finishAnsweredExpense(fixture());expect(mocks.queued).not.toHaveBeenCalled();expect(mocks.process).toHaveBeenCalledOnce()
 })
 it('never acknowledges enrichment if the category write fails',async()=>{
  const f=fixture();mocks.record.mockRejectedValue(Error('stale decision'))
  await expect(finishAnsweredExpense({...f,deferQueuedTaxReassessment:true})).rejects.toThrow('stale decision')
  expect(mocks.queued).not.toHaveBeenCalled();expect(mocks.process).not.toHaveBeenCalled()
 })
})
