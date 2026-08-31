import type { SupabaseClient } from '@supabase/supabase-js'
import { listTransactionReadModel } from './transaction-read-model'
import { listMileageContext } from '../mileage/repository'

export type WeeklyReviewStage='personal'|'mixed'|'questions'|'documentation'|'mileage'|'final'
export type WeeklyReviewTransaction={id:string;recordId:string;currentDecisionId:string;date:string;merchant:string;
  amountCents:number;categoryLabel:string|null;treatment:string;bookkeepingNature:string|null;hasReceipt:boolean;receiptLost:boolean}

export type CustomerWeeklyReview = {
  id:string; eventId:string; snapshotId:string; periodStart:string; periodEnd:string
  scope:'expenses'|'business'; incomeCents:number|null; expenseCents:number
  personalExcludedCount:number;missingDocumentationCount:number;unresolvedQuestionCount:number
  corrected:boolean; items:Array<{id:string;recordId:string;decisionId:string;transactionId:string|null;role:string;label:string;
    categoryLabel:string|null;treatment:string;date:string;amountCents:number}>
  workflowStage:WeeklyReviewStage;workflowEventId:string|null;transactions:WeeklyReviewTransaction[]
  workflowCompletedStage:WeeklyReviewStage|null
  mileage:{vehicles:Array<{id:string;displayName:string}>;entries:Array<{id:string;date:string;milesMilli:number;purpose:string|null}>}
}

export type CustomerWeeklyReviewDescriptor={
  id:string;periodStart:string;periodEnd:string;eventType:string;deferredUntil:string|null;actionable:boolean
}

async function customerContext(supabase:SupabaseClient){
  const {data:{user}}=await supabase.auth.getUser();if(!user)return null
  const business=await supabase.from('businesses').select('id').eq('owner_user_id',user.id).maybeSingle()
  const businessId=(business.data?.id as string|undefined)??null
  return businessId?{businessId,userId:user.id}:null
}

export async function listCustomerWeeklyReviews(supabase:SupabaseClient):Promise<CustomerWeeklyReviewDescriptor[]>{
  const context=await customerContext(supabase);if(!context)return[]
  const{businessId}=context
  const periods=await supabase.from('bookkeeping_review_periods').select('id,period_start,period_end')
    .eq('business_id',businessId).order('period_start',{ascending:true}).limit(52)
  if(periods.error)throw new Error('Weekly reviews could not be loaded.')
  const result:CustomerWeeklyReviewDescriptor[]=[]
  for(const period of periods.data??[]){
    const events=await supabase.from('bookkeeping_review_period_events')
      .select('event_type,deferred_until').eq('review_period_id',period.id)
      .order('sequence_number',{ascending:false}).limit(1)
    if(events.error)throw new Error('Weekly review status could not be loaded.')
    const leaf=events.data?.[0];if(!leaf||['confirmed','closed_unreviewed'].includes(leaf.event_type))continue
    result.push({id:period.id,periodStart:period.period_start,periodEnd:period.period_end,eventType:leaf.event_type,
      deferredUntil:leaf.deferred_until??null,actionable:leaf.event_type!=='deferred'})
  }
  return result
}

async function loadCustomerWeeklyReview(supabase:SupabaseClient,reviewId?:string):Promise<CustomerWeeklyReview|null>{
  const context=await customerContext(supabase);if(!context)return null
  const{businessId,userId}=context
  let periodQuery=supabase.from('bookkeeping_review_periods').select('*').eq('business_id',businessId)
  if(reviewId)periodQuery=periodQuery.eq('id',reviewId)
  const periods=await periodQuery.order('period_end',{ascending:true}).limit(reviewId?1:52)
  if(periods.error)throw new Error('Weekly review could not be loaded.')
  for(const period of periods.data??[]){
    const events=await supabase.from('bookkeeping_review_period_events').select('*').eq('review_period_id',period.id)
      .order('sequence_number',{ascending:false}).limit(1)
    const leaf=events.data?.[0]
    // A customer-deferred presented review stays out of the active Home conversation
    // until the canonical worker re-presents it. It is neither confirmation nor an
    // invitation to restart the pre-snapshot workflow on refresh.
    if(leaf?.event_type==='deferred')continue
    if(!leaf||['confirmed','closed_unreviewed'].includes(leaf.event_type))continue
    const workflow=await supabase.from('bookkeeping_weekly_review_workflow_events').select('*')
      .eq('review_period_id',period.id)
    // A deployment without the additive workflow migration remains fail-closed.
    if(workflow.error&&workflow.error.code!=='42P01')throw new Error('Weekly review progress could not be loaded.')
    const supersededWorkflowEvents=new Set((workflow.data??[]).map(event=>event.supersedes_event_id).filter(Boolean))
    const workflowLeaf=(workflow.data??[]).find(event=>!supersededWorkflowEvents.has(event.id))??null
    const guided=workflowLeaf?.details?.flowVersion===2
    const nextStage:WeeklyReviewStage=!workflowLeaf?'personal':(guided
      ?({personal:'documentation',documentation:'questions',questions:'final',final:'final'} as Record<string,WeeklyReviewStage>)[workflowLeaf.stage]
      :({personal:'mixed',mixed:'questions',questions:'documentation',documentation:'mileage',mileage:'final',final:'final'} as Record<string,WeeklyReviewStage>)[workflowLeaf.stage])??'personal'
    const raw=await listTransactionReadModel({supabase,userId,start:period.period_start,end:period.period_end,limit:1000})
    const canonical=raw.filter(row=>row.sourceModel==='canonical'&&row.sourceKind==='financial_transaction'
      &&row.recordId&&row.currentDecisionId)
      .sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))
    const decisionIds=canonical.map(row=>row.currentDecisionId!)
    const allocationResult=decisionIds.length?await supabase.from('bookkeeping_allocations')
      .select('bookkeeping_decision_id,tax_category_key').in('bookkeeping_decision_id',decisionIds)
      .eq('allocation_kind','business').not('tax_category_key','is',null):{data:[],error:null}
    const keys=[...new Set((allocationResult.data??[]).map(row=>row.tax_category_key).filter(Boolean))]
    const categoryResult=keys.length?await supabase.from('categories').select('key,label').in('key',keys):{data:[],error:null}
    const categoryByKey=new Map((categoryResult.data??[]).map(row=>[row.key,row.label]))
    const keyByDecision=new Map((allocationResult.data??[]).map(row=>[row.bookkeeping_decision_id,row.tax_category_key]))
    const transactions=canonical.map(row=>({id:row.id,recordId:row.recordId!,currentDecisionId:row.currentDecisionId!,
      date:row.date,merchant:row.vendor,amountCents:row.amountCents,
      categoryLabel:categoryByKey.get(keyByDecision.get(row.currentDecisionId!))??null,
      treatment:row.treatment??'unresolved',bookkeepingNature:row.bookkeepingNature,
      hasReceipt:row.has_receipt,receiptLost:row.receiptLost}))
    const mileageContext=await listMileageContext(supabase,{start:period.period_start,end:period.period_end})
    const mileage={vehicles:mileageContext.vehicles.filter(vehicle=>!vehicle.archived_at).map(vehicle=>({id:vehicle.id,
      displayName:vehicle.display_name})),entries:mileageContext.entries.map(entry=>({id:entry.id,date:entry.occurred_on,
      milesMilli:Number(entry.miles_milli),purpose:entry.business_purpose}))}
    if(!['presented','correction_linked'].includes(leaf.event_type)||!leaf.review_snapshot_id){
      return{id:period.id,eventId:leaf.id,snapshotId:'',periodStart:period.period_start,periodEnd:period.period_end,
        scope:period.membership_scope,incomeCents:null,expenseCents:0,personalExcludedCount:0,missingDocumentationCount:0,corrected:false,items:[],workflowStage:nextStage,
        unresolvedQuestionCount:0,
        workflowEventId:workflowLeaf?.id??null,workflowCompletedStage:(workflowLeaf?.stage as WeeklyReviewStage|undefined)??null,transactions,mileage}
    }
    const [snapshot,items,corrections]=await Promise.all([
      supabase.from('bookkeeping_review_snapshots').select('*').eq('id',leaf.review_snapshot_id).single(),
      supabase.from('bookkeeping_review_snapshot_items').select('*').eq('review_snapshot_id',leaf.review_snapshot_id)
        .order('occurred_on').order('bookkeeping_record_id').order('id'),
      supabase.from('bookkeeping_review_correction_links').select('id,prior_decision_id,resulting_decision_id').eq('review_snapshot_id',leaf.review_snapshot_id),
    ])
    if(!snapshot.data)return null
    const links=corrections.data??[],resultingIds=links.map(link=>link.resulting_decision_id)
    const resulting=resultingIds.length?await supabase.from('bookkeeping_decisions').select('id,treatment,bookkeeping_nature').in('id',resultingIds):{data:[],error:null}
    const allocations=resultingIds.length?await supabase.from('bookkeeping_allocations').select('bookkeeping_decision_id,allocation_kind,amount_cents').in('bookkeeping_decision_id',resultingIds):{data:[],error:null}
    const linkByPrior=new Map(links.map(link=>[link.prior_decision_id,link.resulting_decision_id]))
    const decisionById=new Map((resulting.data??[]).map(decision=>[decision.id,decision]))
    const allocationsByDecision=new Map<string,Array<{allocation_kind:string;amount_cents:number}>>()
    for(const allocation of allocations.data??[])allocationsByDecision.set(allocation.bookkeeping_decision_id,[...(allocationsByDecision.get(allocation.bookkeeping_decision_id)??[]),allocation])
    const latestDecisionId=(initial:string)=>{let current=initial,next=linkByPrior.get(current),guard=0
      while(next&&guard++<100){current=next;next=linkByPrior.get(current)}return current===initial?null:current}
    const presentedItems=(items.data??[]).flatMap((item)=>{const resultingId=latestDecisionId(item.bookkeeping_decision_id)
      const decision=resultingId?decisionById.get(resultingId):null
      if(decision&&['personal','excluded'].includes(decision.treatment))return[]
      const businessAmount=resultingId?(allocationsByDecision.get(resultingId)??[])
        .filter(allocation=>allocation.allocation_kind==='business').reduce((sum,allocation)=>sum+Number(allocation.amount_cents),0):Number(item.signed_business_amount_cents)
      return[{id:item.id,recordId:item.bookkeeping_record_id,decisionId:resultingId??item.bookkeeping_decision_id,
        role:item.activity_role,transactionId:item.financial_transaction_id,label:item.display_label,categoryLabel:item.category_label??null,
        treatment:decision?.treatment??item.treatment,date:item.occurred_on,amountCents:businessAmount}]})
    const correctedIncome=Math.abs(presentedItems.filter(item=>item.role==='income').reduce((sum,item)=>sum+item.amountCents,0))
    const correctedExpenses=Math.abs(presentedItems.filter(item=>item.role==='expense').reduce((sum,item)=>sum+item.amountCents,0))
    return{id:period.id,eventId:leaf.id,snapshotId:snapshot.data.id,periodStart:period.period_start,
      periodEnd:period.period_end,scope:period.membership_scope,
      expenseCents:links.length?correctedExpenses:Number(snapshot.data.expense_cents),personalExcludedCount:Number(snapshot.data.personal_excluded_count??0)+(items.data??[]).length-presentedItems.length,
      missingDocumentationCount:Number(snapshot.data.missing_documentation_count??0),corrected:(corrections.data?.length??0)>0,
      unresolvedQuestionCount:Number(snapshot.data.unresolved_question_count??0),
      workflowStage:'final',workflowEventId:workflowLeaf?.id??null,workflowCompletedStage:(workflowLeaf?.stage as WeeklyReviewStage|undefined)??null,transactions,mileage,
      incomeCents:snapshot.data.income_cents==null?null:links.length?correctedIncome:Number(snapshot.data.income_cents),items:presentedItems}
  }
  return null
}

export async function getCurrentCustomerWeeklyReview(supabase:SupabaseClient){return loadCustomerWeeklyReview(supabase)}
export async function getCustomerWeeklyReviewById(supabase:SupabaseClient,reviewId:string){
  return loadCustomerWeeklyReview(supabase,reviewId)
}
