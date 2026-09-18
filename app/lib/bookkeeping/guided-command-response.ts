import {requestUser} from '../performance/request-identity'
import 'server-only'
import {createServerSupabase} from '../../../utils/supabase/server'
import {loadCustomerEntitlements} from '../membership/entitlements'
import {loadBettiWork} from './betti-work-loader'
import {timed} from '../performance/request-timing'

/** Optional continuation of an explicit, successfully persisted command. Never a GET
 * side effect, optimistic answer, or cross-request cache. Projection failure must not
 * turn a committed answer into an apparent failed write. */
export function guidedCommand<Rest extends unknown[]>(handler:(request:Request,...rest:Rest)=>Promise<Response>){
 return async(request:Request,...rest:Rest):Promise<Response>=>{
  const body=request.headers.get('x-betti-guided')==='1'?await request.clone().json().catch(()=>null):null
  const deferred=body?.action==='defer'||body?.disposition==='deferred'
  const response=await timed('canonical_command',()=>handler(request,...rest))
  if(!response.ok||request.headers.get('x-betti-guided')!=='1')return response
  try{
   const db=await createServerSupabase()
   const [{data:{user}}, {data:assurance}, membership]=await Promise.all([
    requestUser(db),db.auth.mfa.getAuthenticatorAssuranceLevel(),loadCustomerEntitlements(db),
   ])
   if(!user||assurance?.currentLevel!=='aal2'||!membership.businessId||!membership.capabilities.has('autonomous_processing'))return response
   // Deferral supplies no new bookkeeping fact; its canonical event is enough.
   if(!deferred)await timed('question_reconciliation',async()=>{
    const result=await db.rpc('reconcile_current_betti_questions');if(result.error)throw new Error('Reconciliation unavailable')
   })
   const record=request.headers.get('x-betti-record')
   const work=await timed('next_projection',()=>loadBettiWork({db,businessId:membership.businessId!,scope:membership.plan??'expenses',
    continuityRecordId:record&&/^[0-9a-f-]{36}$/i.test(record)?record:undefined,
    processingEnabled:process.env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED!=='false'}))
   return Response.json({...await response.clone().json(),work},{status:response.status,headers:{'Cache-Control':'private, no-store'}})
  }catch{
   // The client keeps its uncertain-response/refresh path. Never replay the command.
   return response
  }
 }
}
