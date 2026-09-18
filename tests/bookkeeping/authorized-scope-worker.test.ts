import {describe,it,expect,vi,beforeEach} from 'vitest'
import type {SupabaseClient} from '@supabase/supabase-js'
const snapshot=vi.hoisted(()=>vi.fn())
vi.mock('../../app/lib/bookkeeping/evaluation-snapshot',()=>({loadBookkeepingEvaluationSnapshot:snapshot}))
import {evaluateBookkeepingProcessingJob} from '../../app/lib/bookkeeping/processing'
beforeEach(()=>{snapshot.mockReset();snapshot.mockResolvedValue(null)})
function client(date:string,businessId='owned'){
 const rpc=vi.fn(async(name:string,args:unknown)=>{expect(name).toBe('read_authorized_bookkeeping_scope');expect(args).toEqual({p_business_id:'owned'});return{data:{businessId,authorizedStart:'2026-08-01'},error:null}})
 const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{occurred_on:date},error:null})}
 return{db:{rpc,from:vi.fn(()=>q)} as unknown as SupabaseClient,rpc}
}
const job={business_id:'owned',bookkeeping_record_id:'retained',processing_reason:'deterministic_evaluation',target_fingerprint:'bookkeeping-evaluator:v1:record:retained'}
describe('authorized scope before bookkeeping processing',()=>{
 it('retains earlier evidence without running any assessment or decision logic',async()=>{
  const{db}=client('2026-05-03');expect(await evaluateBookkeepingProcessingJob(db,job)).toEqual({outcome:'outside_scope'});expect(snapshot).not.toHaveBeenCalled()
 })
 it('allows the same canonical engine to assess activity on the inclusive start date',async()=>{
  const{db}=client('2026-08-01');expect(await evaluateBookkeepingProcessingJob(db,job)).toEqual({outcome:'inactive'});expect(snapshot).toHaveBeenCalledOnce()
 })
 it('fails closed when scope authority belongs to another business',async()=>{
  const{db}=client('2026-08-01','foreign');await expect(evaluateBookkeepingProcessingJob(db,job)).rejects.toThrow('scope unavailable');expect(snapshot).not.toHaveBeenCalled()
 })
})
