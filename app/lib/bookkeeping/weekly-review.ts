import type { SupabaseClient } from '@supabase/supabase-js'
import { listTransactionReadModel } from './transaction-read-model'
import { listMileageContext } from '../mileage/repository'

export type WeeklyReviewStage='personal'|'mixed'|'questions'|'documentation'|'mileage'|'final'
export type WeeklyReviewTransaction={id:string;recordId:string;currentDecisionId:string;date:string;merchant:string;
  amountCents:number;categoryLabel:string|null;treatment:string;bookkeepingNature:string|null;hasReceipt:boolean;receiptLost:boolean}

export type CustomerWeeklyReview = {
  id:string; eventId:string; snapshotId:string; periodStart:string; periodEnd:string
  scope:'expenses'|'business'; incomeCents:number|null; expenseCents:number
  corrected:boolean; items:Array<{id:string;recordId:string;transactionId:string|null;role:string;label:string;
    categoryLabel:string|null;treatment:string;date:string;amountCents:number}>
  workflowStage:WeeklyReviewStage;workflowEventId:string|null;transactions:WeeklyReviewTransaction[]
  mileage:{vehicles:Array<{id:string;displayName:string}>;entries:Array<{id:string;date:string;milesMilli:number;purpose:string|null}>}
}

export async function getCurrentCustomerWeeklyReview(supabase:SupabaseClient):Promise<CustomerWeeklyReview|null>{
  const {data:{user}}=await supabase.auth.getUser();if(!user)return null
  const business=await supabase.from('businesses').select('id').eq('owner_user_id',user.id).maybeSingle()
  if(!business.data)return null
  const periods=await supabase.from('bookkeeping_review_periods').select('*').eq('business_id',business.data.id)
    .order('period_end',{ascending:false}).limit(12)
  for(const period of periods.data??[]){
    const events=await supabase.from('bookkeeping_review_period_events').select('*').eq('review_period_id',period.id)
      .order('sequence_number',{ascending:false}).limit(1)
    const leaf=events.data?.[0]
    if(!leaf||['confirmed','closed_unreviewed'].includes(leaf.event_type))continue
    const workflow=await supabase.from('bookkeeping_weekly_review_workflow_events').select('*')
      .eq('review_period_id',period.id).order('created_at',{ascending:false}).limit(1)
    // A deployment without the additive workflow migration remains fail-closed.
    if(workflow.error&&workflow.error.code!=='42P01')throw new Error('Weekly review progress could not be loaded.')
    const workflowLeaf=workflow.data?.[0]??null
    const nextStage:WeeklyReviewStage=!workflowLeaf?'personal':({personal:'mixed',mixed:'questions',questions:'documentation',
      documentation:'mileage',mileage:'final',final:'final'} as Record<string,WeeklyReviewStage>)[workflowLeaf.stage]??'personal'
    const raw=await listTransactionReadModel({supabase,userId:user.id,start:period.period_start,end:period.period_end,limit:1000})
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
        scope:period.membership_scope,incomeCents:null,expenseCents:0,corrected:false,items:[],workflowStage:nextStage,
        workflowEventId:workflowLeaf?.id??null,transactions,mileage}
    }
    const [snapshot,items,corrections]=await Promise.all([
      supabase.from('bookkeeping_review_snapshots').select('*').eq('id',leaf.review_snapshot_id).single(),
      supabase.from('bookkeeping_review_snapshot_items').select('*').eq('review_snapshot_id',leaf.review_snapshot_id)
        .order('occurred_on').order('bookkeeping_record_id').order('id'),
      supabase.from('bookkeeping_review_correction_links').select('id').eq('review_snapshot_id',leaf.review_snapshot_id),
    ])
    if(!snapshot.data)return null
    return{id:period.id,eventId:leaf.id,snapshotId:snapshot.data.id,periodStart:period.period_start,
      periodEnd:period.period_end,scope:period.membership_scope,incomeCents:snapshot.data.income_cents==null?null:Number(snapshot.data.income_cents),
      expenseCents:Number(snapshot.data.expense_cents),corrected:(corrections.data?.length??0)>0,
      workflowStage:'final',workflowEventId:workflowLeaf?.id??null,transactions,mileage,
      items:(items.data??[]).map((item)=>({id:item.id,recordId:item.bookkeeping_record_id,role:item.activity_role,
        transactionId:item.financial_transaction_id,label:item.display_label,categoryLabel:item.category_label??null,
        treatment:item.treatment,date:item.occurred_on,
        amountCents:Number(item.signed_business_amount_cents)}))}
  }
  return null
}
