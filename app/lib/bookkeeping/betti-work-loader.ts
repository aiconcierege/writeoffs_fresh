import {timed} from '../performance/request-timing'
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { getCanonicalQuestionCandidates } from './customer-questions'
import { projectBettiWork, type WorkContext } from './betti-work'
import {workSnapshotReader,type WorkInputSnapshot} from './work-input-snapshot'
import {actionIndexEnabled} from './action-index-worker'
import {readBettiActionIndex} from './action-index-reader'

type WorkLoad = {
 db:SupabaseClient;businessId:string;scope:'business'|'expenses';asOf?:string
 continuityRecordId?:string;processingEnabled?:boolean
 onSnapshot?:(snapshot:WorkInputSnapshot)=>void
}

/** One authenticated STABLE database invocation supplies a single MVCC snapshot.
 * The same canonical question/domain selectors consume it. No persistence, read
 * repair, cross-request cache, or second eligibility/priority policy is introduced. */
export async function loadBettiWork(input:WorkLoad){
 if(actionIndexEnabled()&&!input.onSnapshot&&!input.asOf){
  const indexed=await readBettiActionIndex({...input,view:'full'})
  // A dirty derived summary cannot establish that the customer has no work.
  // Home and recovery reads share the same atomic canonical fallback. Ordinary
  // mutation responses keep their independent-action indexed fast path.
  if(indexed?.index.summaryCurrent)return indexed
 }
 return loadCanonicalBettiWork(input)
}

export async function loadCanonicalBettiWork(input:WorkLoad){
 const asOf=input.asOf??new Date().toISOString()
 const result=await timed('canonical_input_snapshot',async()=>await input.db.rpc('read_betti_work_inputs',{
  p_business_id:input.businessId,p_as_of:asOf,
 }))
 if(result.error||!result.data)throw new Error('Betti work inputs unavailable')
 const snapshot=result.data as WorkInputSnapshot
 const reader=workSnapshotReader(snapshot,input.businessId,asOf)
 const queue=await timed('question_selection',()=>getCanonicalQuestionCandidates({
  supabase:reader,businessId:input.businessId,scope:input.scope,asOf,
 }))
 const work=await timed('projection_construction',async()=>projectBettiWork({
  businessId:input.businessId,context:snapshot.context,questions:queue.questions,asOf,
  continuityRecordId:input.continuityRecordId,processingEnabled:input.processingEnabled,
 }))
 input.onSnapshot?.(snapshot)
 return work
}

/** Differential certification reference. Never used as an error fallback: a
 * failed atomic read must not silently switch consistency or eligibility models. */
export async function loadBettiWorkReference(input:WorkLoad){
 const asOf=input.asOf??new Date().toISOString()
 const read=async()=>{
  const result=await input.db.rpc('read_betti_work_context',{p_business_id:input.businessId})
  if(result.error||!result.data)throw new Error('Betti work context unavailable')
  return result.data as WorkContext
 }
 const digest=(context:WorkContext)=>createHash('sha256').update(JSON.stringify(context)).digest('hex')
 for(let attempt=0;attempt<2;attempt++){
  const before=await read()
  if(before.records.length>=1000||before.links.length>=1000||(before.questionVersions?.length??0)>=1000)
   throw new Error('Projection question adapter capacity exceeded')
  const queue=await getCanonicalQuestionCandidates({supabase:input.db,scope:input.scope,asOf,businessId:input.businessId})
  const after=await read()
  if(digest(before)!==digest(after))continue
  return projectBettiWork({businessId:input.businessId,context:after,questions:queue.questions,asOf,
   continuityRecordId:input.continuityRecordId,processingEnabled:input.processingEnabled})
 }
 throw new Error('Betti work changed during projection; retry the read')
}
