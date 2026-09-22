import {vehicleQuestionProjectionCurrent} from '../mileage/annual-use-question'
import {guidedWorkProjection} from './guided-work-projection'
import {requestUser} from '../performance/request-identity'
import 'server-only'
import {createServerSupabase} from '../../../utils/supabase/server'
import {loadCustomerEntitlements} from '../membership/entitlements'
import {loadBettiWork} from './betti-work-loader'
import {timed} from '../performance/request-timing'
import {after} from 'next/server'
import {actionIndexEnabled,refreshBettiActionIndex} from './action-index-worker'
import {readBettiActionIndex} from './action-index-reader'

export function guidedContinuityRecord(request:Request){
 let record=request.headers.get('x-betti-record')
 if(!record)try{const source=new URL(request.headers.get('referer')??'')
  if(source.origin===new URL(request.url).origin&&source.pathname==='/check-in')record=source.searchParams.get('record')
 }catch{/* A context hint is optional and never changes ownership/eligibility. */}
 return record&&/^[0-9a-f-]{36}$/i.test(record)?record:undefined
}

/** Optional continuation of an explicit, successfully persisted command. Never a GET
 * side effect, optimistic answer, or cross-request cache. Projection failure must not
 * turn a committed answer into an apparent failed write. */
export function guidedCommand<Rest extends unknown[]>(handler:(request:Request,...rest:Rest)=>Promise<Response>,options:{deferralField?:'action'|'disposition'}={}){
 return async(request:Request,...rest:Rest):Promise<Response>=>{
  const requestBody=request.headers.get('x-betti-guided')==='1'?request.clone():null
  let response=await timed('canonical_command',()=>handler(request,...rest))
  if(!response.ok||request.headers.get('x-betti-guided')!=='1')return response
  try{
   const committed=await response.clone().json()
   if(committed.work&&!vehicleQuestionProjectionCurrent(committed.work)){
    // Preserve the committed answer, but never return a stale continuation if
    // canonical fallback fails. The existing client refresh path remains safe.
    const {work:_staleWork,...saved}=committed
    void _staleWork
    response=Response.json(saved,{status:response.status,headers:{'Cache-Control':'private, no-store'}})
   }
   const body=await requestBody?.json().catch(()=>null)
   const deferred=options.deferralField==='action'?body?.action==='defer':options.deferralField==='disposition'?body?.disposition==='deferred':false
   const db=await createServerSupabase()
   const [{data:{user}}, {data:assurance}, membership]=await Promise.all([
    requestUser(db),db.auth.mfa.getAuthenticatorAssuranceLevel(),loadCustomerEntitlements(db),
   ])
   if(!user||assurance?.currentLevel!=='aal2'||!membership.businessId||!membership.capabilities.has('autonomous_processing'))return response
   if(actionIndexEnabled()){
    // Durable invalidation was committed with the fact. after() accelerates the
    // leased refresh; the cron is its recovery path if this callback is lost.
    after(async()=>{
     try{
      await refreshBettiActionIndex({businessId:membership.businessId!,limit:2})
     }catch{console.error('BETTI_ACTION_INDEX_REFRESH_PENDING')}
    })
    const saved=await response.clone().json()
    if(saved.work?.index?.version===1&&vehicleQuestionProjectionCurrent(saved.work))return response
    const indexed=await readBettiActionIndex({db,businessId:membership.businessId,view:'guided',
     continuityRecordId:guidedContinuityRecord(request),processingEnabled:process.env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED!=='false'})
    if(indexed)return Response.json({...saved,work:indexed},{status:response.status,headers:{'Cache-Control':'private, no-store'}})
   }
   // Deferral supplies no new bookkeeping fact; its canonical event is enough.
   if(!deferred)await timed('question_reconciliation',async()=>{
    const result=await db.rpc('reconcile_current_betti_questions');if(result.error)throw new Error('Reconciliation unavailable')
   })
   const record=guidedContinuityRecord(request)
   const work=await timed('next_projection',()=>loadBettiWork({db,businessId:membership.businessId!,scope:membership.plan??'expenses',
    continuityRecordId:record&&/^[0-9a-f-]{36}$/i.test(record)?record:undefined,
    processingEnabled:process.env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED!=='false'}))
   return Response.json({...await response.clone().json(),work:guidedWorkProjection(work)},{status:response.status,headers:{'Cache-Control':'private, no-store'}})
  }catch{
   // The client keeps its uncertain-response/refresh path. Never replay the command.
   return response
  }
 }
}
