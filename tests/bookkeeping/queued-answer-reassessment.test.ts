import {describe,it,expect,vi} from 'vitest'
import type {SupabaseClient} from '@supabase/supabase-js'
import {hasQueuedAnswerReassessment} from '../../app/lib/bookkeeping/queued-answer-reassessment'
function fixture(){
 const end=vi.fn().mockResolvedValue({data:{id:'job'},error:null})
 const query={eq:vi.fn(),in:vi.fn(),limit:vi.fn(),maybeSingle:end}
 query.eq.mockReturnValue(query);query.in.mockReturnValue(query);query.limit.mockReturnValue(query)
 const from=vi.fn().mockReturnValue({select:()=>query})
 return {admin:{from} as unknown as SupabaseClient,from,query,end,businessId:'owner-business',result:{decision:{id:'saved-decision',businessId:'owner-business',bookkeepingRecordId:'owned-record',bookkeepingNature:'expense',allocations:[{kind:'business',taxCategoryKey:'insurance'}]}}}
}
describe('canonical fallback durable reassessment boundary',()=>{
 it('requires a queued job for the exact tenant, record and newly committed decision',async()=>{
  const f=fixture();expect(await hasQueuedAnswerReassessment(f)).toBe(true)
  expect(f.query.eq.mock.calls).toEqual([['business_id','owner-business'],['bookkeeping_record_id','owned-record'],['processing_reason','deterministic_evaluation'],['target_fingerprint','bookkeeping-evaluator:v1:record:owned-record:schedule-c-decision:saved-decision']])
  expect(f.query.in).toHaveBeenCalledWith('state',['pending','processing','retryable'])
 })
 it.each([null,{}, {decision:{bookkeepingNature:'income'}},{decision:{id:'saved-decision',businessId:'another-tenant',bookkeepingRecordId:'foreign',bookkeepingNature:'expense'}}])('never uses an unowned or unsupported result',async result=>{
  const f=fixture();expect(await hasQueuedAnswerReassessment({...f,result})).toBe(false);expect(f.from).not.toHaveBeenCalled()
 })
 it('keeps missing category enrichment synchronous because the worker cannot author customer decisions',async()=>{const f=fixture();expect(await hasQueuedAnswerReassessment({...f,result:{decision:{...f.result.decision,allocations:[{kind:'business',taxCategoryKey:null}]}}})).toBe(false);expect(f.from).not.toHaveBeenCalled()})
 it('does not bypass a follow-up event',async()=>{const f=fixture();expect(await hasQueuedAnswerReassessment({...f,result:{...f.result,followUpEvent:{id:'dependent'}}})).toBe(false);expect(f.from).not.toHaveBeenCalled()})
 it.each([{data:null,error:null},{data:null,error:{code:'503'}}])('keeps synchronous work when durability is unproven',async response=>{const f=fixture();f.end.mockResolvedValue(response);expect(await hasQueuedAnswerReassessment(f)).toBe(false)})
 it('fails closed on a transport exception',async()=>{const f=fixture();f.end.mockRejectedValue(Error('network'));expect(await hasQueuedAnswerReassessment(f)).toBe(false)})
})
