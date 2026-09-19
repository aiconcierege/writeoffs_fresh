import 'server-only'
import type {SupabaseClient} from '@supabase/supabase-js'
import type {CanonicalWeeklyReviewItem} from './model'
import type {GuidedWorkProjection} from './guided-work-projection'
import type {WorkAction} from './betti-work'
import {timed} from '../performance/request-timing'

export async function readIndexedQuestion(db:SupabaseClient,businessId:string,id:string,version:string){
 const r=await timed('indexed_action_lookup',async()=>await db.rpc('read_betti_indexed_question',{
  p_business_id:businessId,p_question_id:id,p_question_version:version,
 }))
 if(r.error)throw new Error('Indexed question unavailable')
 return r.data as {initialized:boolean;action:WorkAction|null;commandItem:CanonicalWeeklyReviewItem|null;replay?:{functionName:string;arguments:Record<string,unknown>}}
}

/** The existing answer adapters still validate/normalize the real-world answer.
 * The SQL envelope revalidates the indexed action under a lock, invokes only its
 * allowlisted canonical RPC, persists, and selects next work in that transaction. */
export function indexedQuestionClient(input:{db:SupabaseClient;businessId:string;id:string;version:string;continuityRecordId?:string;replay?:{functionName:string;arguments:Record<string,unknown>}}){
 let next:GuidedWorkProjection|null=null
 let backgroundSafe=false
 const client=new Proxy(input.db,{
  get(target,key){
   if(key==='rpc')return async(name:string,args:Record<string,unknown>)=>{
    const canonicalArgs=input.replay?.functionName===name&&name==='skip_bookkeeping_review_issue'
     ?{...args,p_deferred_until:input.replay.arguments.p_deferred_until}:args
    const parameters={
     p_business_id:input.businessId,p_question_id:input.id,p_question_version:input.version,p_function_name:name,p_arguments:canonicalArgs,
     p_continuity_record_id:input.continuityRecordId??null,p_processing_enabled:process.env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED!=='false',
    }
    const result=await timed('indexed_canonical_commit',async()=>{
     const first=await target.rpc('execute_betti_indexed_question',parameters)
     // PostgreSQL guarantees a deadlock victim's transaction was rolled back.
     // One identical retry is safe; never retry stale versions or ambiguous I/O.
     return first.error?.code==='40P01'?await target.rpc('execute_betti_indexed_question',parameters):first
    })
    if(!result.error&&result.data?._guidedIndex){
     if(result.data._guidedIndex.businessId!==input.businessId)throw new Error('Unowned indexed next action')
     next=result.data._guidedIndex
    }
    if(!result.error)backgroundSafe=result.data?._indexBackgroundSafe===true
    return result
   }
   const value=Reflect.get(target,key,target)
   return typeof value==='function'?value.bind(target):value
  },
 })
 return{client,next:()=>next,backgroundSafe:()=>backgroundSafe}
}
