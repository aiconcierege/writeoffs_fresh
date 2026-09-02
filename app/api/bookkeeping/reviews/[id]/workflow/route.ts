import {NextResponse}from'next/server'
import{createServerSupabase}from'../../../../../../utils/supabase/server'
import{correctCanonicalTransactionUse}from'../../../../../lib/bookkeeping/transaction-corrections'
import{listCustomerQuestions}from'../../../../../lib/bookkeeping/customer-questions'
import{listTransactionReadModel}from'../../../../../lib/bookkeeping/transaction-read-model'
import{createServerAdminSupabase}from'../../../../../../utils/supabase/admin'
import{createHash}from'node:crypto'
import{listCurrentPeriodMixedClarifications}from'../../../../../lib/bookkeeping/weekly-review-mixed-issues'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const stages=['personal','mixed','questions','documentation','mileage','final'] as const

async function ensurePeriodDocumentationRequests(input:{supabase:Awaited<ReturnType<typeof createServerSupabase>>;
 userId:string;businessId:string;start:string;end:string}){
 const rows=await listTransactionReadModel({supabase:input.supabase,userId:input.userId,start:input.start,end:input.end,limit:1000})
 const candidates=rows.filter(row=>row.sourceModel==='canonical'&&row.recordId&&row.amountCents<0
  &&row.bookkeepingNature==='expense'&&['business','mixed_use'].includes(row.treatment??'')
  &&!row.has_receipt&&!row.receiptLost)
 const admin=createServerAdminSupabase()
 for(const row of candidates){const contextFingerprint=createHash('sha256').update(`weekly-missing-receipt:v1:${row.recordId}`).digest('hex')
  const opened=await admin.rpc('open_bookkeeping_documentation_request',{p_business_id:input.businessId,
   p_bookkeeping_record_id:row.recordId,p_reason:'MISSING_SUPPORTING_DOCUMENTATION',
   p_issue_key:'weekly-missing-supporting-documentation',p_context_fingerprint:contextFingerprint,
   p_question_context:{schemaVersion:1,reason:'MISSING_SUPPORTING_DOCUMENTATION',requirement:{type:'receipt_for_record',version:1}}})
  if(opened.error)throw new Error('The receipt check could not be prepared safely.')
 }
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser()
 if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
 const{id}=await params;let body:Record<string,unknown>
 try{body=await request.json()}catch{return NextResponse.json({error:'Invalid review action.'},{status:400})}
 const stage=String(body.stage??''),requestId=String(body.requestId??''),expectedEventId=body.expectedEventId==null?null:String(body.expectedEventId)
 if(!UUID.test(id)||!stages.includes(stage as typeof stages[number])||!UUID.test(requestId)
  ||(expectedEventId!==null&&!UUID.test(expectedEventId)))return NextResponse.json({error:'Invalid review action.'},{status:400})
 const period=await supabase.from('bookkeeping_review_periods').select('business_id,period_start,period_end').eq('id',id).single()
 if(period.error)return NextResponse.json({error:'Review period was not found.'},{status:404})
 const workflowState=expectedEventId?await supabase.from('bookkeeping_weekly_review_workflow_events')
  .select('id,stage,event_type,details').eq('id',expectedEventId).eq('review_period_id',id).maybeSingle():{data:null,error:null}
 const flowVersion=workflowState.data?.details?.flowVersion===2?2:workflowState.data?.details?.flowVersion===3?3:expectedEventId?1:3
  try{
  if(stage==='documentation'){
   await ensurePeriodDocumentationRequests({supabase,userId:user.id,businessId:period.data.business_id,
    start:period.data.period_start,end:period.data.period_end})
   const decision=body.documentationDecision,recordIds=body.recordIds
   const completeStage=body.completeStage!==false
   if(!['include_missing','exclude_missing','no_missing'].includes(String(decision))||!Array.isArray(recordIds)
    ||(decision!=='no_missing'&&recordIds.length===0)||recordIds.length>500||recordIds.some(value=>typeof value!=='string'||!UUID.test(value)))
    throw new Error('Choose how to handle the missing receipts shown in this review.')
   const completed=await supabase.rpc('complete_weekly_missing_documentation_decision',{
    p_review_period_id:id,p_expected_workflow_event_id:expectedEventId,p_request_id:requestId,
    p_decision:decision,p_record_ids:recordIds,p_complete_stage:completeStage})
   if(completed.error)throw new Error(completed.error.message)
   const result=completed.data as Record<string,unknown>
   return NextResponse.json({ok:true,eventId:result.workflow_event_id??expectedEventId})
  }
  const changes=Array.isArray(body.changes)?body.changes:[]
  if(stage==='personal'){
   const items=changes.map(change=>{const value=change as Record<string,unknown>
    if(value.use!=='personal'||!UUID.test(String(value.transactionId??''))||!UUID.test(String(value.decisionId??'')))
      throw new Error('A personal transaction selection changed. Refresh and try again.')
    return{transactionId:value.transactionId,decisionId:value.decisionId,use:'personal',correctionRequestId:crypto.randomUUID()}})
   const completed=await supabase.rpc('complete_weekly_personal_sweep',{p_review_period_id:id,
    p_expected_workflow_event_id:expectedEventId,p_request_id:requestId,p_items:items})
   if(completed.error)throw new Error(completed.error.message)
   if(flowVersion!==3)await ensurePeriodDocumentationRequests({supabase,userId:user.id,businessId:period.data.business_id,
    start:period.data.period_start,end:period.data.period_end})
   return NextResponse.json({ok:true,eventId:(completed.data as Record<string,unknown>).workflow_event_id})
  }
  if(stage==='mixed'&&flowVersion===3){
   if(workflowState.data?.stage==='mixed'&&workflowState.data.event_type==='stage_reopened'){
    const remaining=await listCurrentPeriodMixedClarifications({supabase,businessId:period.data.business_id,
      periodStart:period.data.period_start,periodEnd:period.data.period_end})
    if(remaining.length)throw new Error('A selected shared expense still needs its business portion.')
    const completed=await supabase.rpc('append_weekly_review_workflow_event',{p_review_period_id:id,
      p_expected_event_id:expectedEventId,p_stage:'mixed',p_event_type:'stage_completed',
      p_details:{resolvedCount:0},p_request_id:requestId})
    if(completed.error)throw new Error(completed.error.message)
    return NextResponse.json({ok:true,eventId:completed.data})
   }
   const items=changes.map(change=>{const value=change as Record<string,unknown>
    if(value.use!=='mixed'||!UUID.test(String(value.recordId??''))||!UUID.test(String(value.transactionId??''))
      ||!UUID.test(String(value.decisionId??'')))throw new Error('A mixed-use selection changed. Refresh and try again.')
    return{recordId:value.recordId,transactionId:value.transactionId,decisionId:value.decisionId}})
   const opened=await supabase.rpc('open_weekly_mixed_clarifications',{p_review_period_id:id,
    p_expected_workflow_event_id:expectedEventId,p_request_id:requestId,p_items:items})
   if(opened.error)throw new Error(opened.error.message)
   return NextResponse.json({ok:true,eventId:(opened.data as Record<string,unknown>).workflow_event_id})
  }
  for(let index=0;index<changes.length;index++){
   const change=changes[index] as Record<string,unknown>,transactionId=String(change.transactionId??''),decisionId=String(change.decisionId??'')
   if(!UUID.test(transactionId)||!UUID.test(decisionId))throw new Error('A transaction changed. Refresh and try again.')
   let answer:unknown
   if(stage==='personal'&&change.use==='personal')answer={schemaVersion:1,use:'personal'}
   else if(stage==='mixed'&&change.use==='mixed'&&Number.isSafeInteger(change.businessAmountCents)){
    const total=Math.abs(Number(change.totalAmountCents)),business=Number(change.businessAmountCents)
    if(business<=0||business>=total)throw new Error('Enter a business amount between zero and the transaction total.')
    answer={schemaVersion:1,use:'mixed',personalAmountCents:total-business}
   }else throw new Error('That review change is not supported.')
   await correctCanonicalTransactionUse({supabase,financialTransactionId:transactionId,
    expectedCurrentDecisionId:decisionId,correctionRequestId:crypto.randomUUID(),answer})
  }
  if(stage==='questions'){
   const questions=await listCustomerQuestions({supabase})
   const remaining=questions.filter(question=>question.transaction.date&&question.transaction.date>=period.data.period_start
    &&question.transaction.date<=period.data.period_end)
   const blocking=flowVersion===3?remaining.filter(question=>question.materiality==='totals'):remaining
   if(blocking.length)throw new Error(`There ${blocking.length===1?'is':'are'} still ${blocking.length} current-week ${blocking.length===1?'question':'questions'} to answer.`)
  }
  const result=await supabase.rpc('append_weekly_review_workflow_event',{p_review_period_id:id,
   p_expected_event_id:expectedEventId,p_stage:stage,p_event_type:'stage_completed',
   p_details:{changeCount:changes.length},p_request_id:requestId})
  if(result.error)throw new Error('This review changed. Refresh and try again.')
  return NextResponse.json({ok:true,eventId:result.data})
 }catch(cause){return NextResponse.json({error:cause instanceof Error?cause.message:'The review could not be updated.'},{status:409})}
}
