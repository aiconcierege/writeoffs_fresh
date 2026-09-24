import 'server-only'
import type {SupabaseClient} from '@supabase/supabase-js'

/** Same exact-decision durable dependency used by execute_betti_indexed_question.
 * businessId comes from the authenticated canonical eligibility snapshot, never
 * the request body. A failed/missing proof keeps the synchronous fallback. */
export async function hasQueuedAnswerReassessment(input:{admin:SupabaseClient;businessId:string;result:unknown}){
 const result=input.result as {decision?:{id?:unknown;businessId?:unknown;bookkeepingRecordId?:unknown;bookkeepingNature?:unknown;allocations?:Array<{kind?:unknown;taxCategoryKey?:unknown}>};followUpEvent?:unknown}|null
 const d=result?.decision
 if(!d||result?.followUpEvent||d.businessId!==input.businessId||d.bookkeepingNature!=='expense'
  ||typeof d.id!=='string'||typeof d.bookkeepingRecordId!=='string')return false
 // The worker can reproduce tax reassessment, but cannot impersonate the
 // customer to append missing categories. Keep that factual enrichment synchronous.
 const business=Array.isArray(d.allocations)?d.allocations.filter(a=>a.kind==='business'):[]
 if(!business.length||business.some(a=>typeof a.taxCategoryKey!=='string'||!a.taxCategoryKey))return false
 try{
  const r=await input.admin.from('bookkeeping_processing_jobs').select('id')
   .eq('business_id',input.businessId).eq('bookkeeping_record_id',d.bookkeepingRecordId)
   .eq('processing_reason','deterministic_evaluation')
   .eq('target_fingerprint',`bookkeeping-evaluator:v1:record:${d.bookkeepingRecordId}:schedule-c-decision:${d.id}`)
   .in('state',['pending','processing','retryable']).limit(1).maybeSingle()
  return !r.error&&Boolean(r.data)
 }catch{return false}
}
