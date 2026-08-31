import 'server-only'

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerAdminSupabase } from '../../../utils/supabase/admin'
import { SupabaseCanonicalFinancialSummaryRepository } from './financial-summary-repository'
import { aggregateCanonicalFinancialSummary } from './financial-summary'
import { latestCheckInOnOrBefore, nextReviewPeriod } from './review-cadence'
import { reviewCategoryLabel } from './weekly-review-presentation'

type Row = Record<string, unknown>
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
function dateInTimezone(date:Date,timeZone:string){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date)
  const value=Object.fromEntries(parts.map((part)=>[part.type,part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function currentDecision(record: Awaited<ReturnType<SupabaseCanonicalFinancialSummaryRepository['loadRecords']>>['records'][number]) {
  const superseded = new Set(record.decisions.map((item) => item.supersedesDecisionId).filter(Boolean))
  return record.decisions.find((item) => !superseded.has(item.id)) ?? null
}

function periodRecordIds(records:Awaited<ReturnType<SupabaseCanonicalFinancialSummaryRepository['loadRecords']>>['records'],start:string,end:string){
 return records.filter(record=>record.occurredOn!==null&&record.occurredOn>=start&&record.occurredOn<=end).map(record=>record.id)
}

async function outstandingQuestions(admin: SupabaseClient, businessId: string, recordIds: string[]) {
  if (!recordIds.length) return 0
  const { data, error } = await admin.from('bookkeeping_review_events')
    .select('id,supersedes_event_id,event_type,bookkeeping_record_id').eq('business_id', businessId)
    .in('bookkeeping_record_id', recordIds)
  if (error) throw new Error('Weekly review questions could not be resolved.')
  const superseded = new Set((data ?? []).map((row) => row.supersedes_event_id).filter(Boolean))
  return (data ?? []).filter((row) => !superseded.has(row.id)
    && ['opened','reopened','skipped'].includes(row.event_type)).length
}

async function appendEvent(admin: SupabaseClient, input: { businessId:string;periodId:string;
  predecessorId:string|null;sequence:number;type:string;snapshotId?:string|null }) {
  const { data,error }=await admin.from('bookkeeping_review_period_events').insert({
    business_id:input.businessId,review_period_id:input.periodId,supersedes_event_id:input.predecessorId,
    sequence_number:input.sequence,event_type:input.type,review_snapshot_id:input.snapshotId??null,
    provenance:'system',
  }).select('id').single()
  if(error)throw new Error(`Weekly review event could not be recorded: ${error.message}`)
  return String(data.id)
}

async function settlePriorReviews(admin:SupabaseClient,businessId:string,asOf:string){
  const days=Number.isInteger(Number(process.env.WEEKLY_REVIEW_RESPONSE_DAYS))
    ?Math.max(7,Number(process.env.WEEKLY_REVIEW_RESPONSE_DAYS)):14
  const periods=await admin.from('bookkeeping_review_periods').select('id,check_in_date')
    .eq('business_id',businessId).order('check_in_date',{ascending:false}).limit(24)
  for(const period of periods.data??[]){
    const events=await admin.from('bookkeeping_review_period_events').select('*').eq('review_period_id',period.id)
      .order('sequence_number',{ascending:false}).limit(1)
    const leaf=events.data?.[0];if(!leaf||['confirmed','closed_unreviewed'].includes(leaf.event_type))continue
    const deadline=new Date(`${period.check_in_date}T00:00:00Z`);deadline.setUTCDate(deadline.getUTCDate()+days)
    if(asOf>=deadline.toISOString().slice(0,10)){
      await appendEvent(admin,{businessId,periodId:period.id,predecessorId:leaf.id,
        sequence:Number(leaf.sequence_number)+1,type:'closed_unreviewed'});continue
    }
    if(leaf.event_type==='deferred'&&leaf.deferred_until
      &&new Date(leaf.deferred_until)<=new Date(`${asOf}T23:59:59Z`)){
      await appendEvent(admin,{businessId,periodId:period.id,predecessorId:leaf.id,
        sequence:Number(leaf.sequence_number)+1,type:'presented',snapshotId:leaf.review_snapshot_id})
    }
  }
}

async function present(admin:SupabaseClient,input:{businessId:string;period:Row;scope:'expenses'|'business';
  predecessorId:string;sequence:number;unresolvedQuestionCount:number;
  records:Awaited<ReturnType<SupabaseCanonicalFinancialSummaryRepository['loadRecords']>>['records']}) {
  const start=String(input.period.period_start),end=String(input.period.period_end)
  const summary=aggregateCanonicalFinancialSummary({records:input.records,periodStart:start,periodEnd:end,
    currency:'USD',unresolvedCustomerQuestionCount:input.unresolvedQuestionCount})
  const contributors=summary.contributors.filter((item)=>input.scope==='business'||item.metric==='business_expenses')
  const grouped=new Map<string,typeof contributors>()
  for(const item of contributors){const key=`${item.recordId}:${item.decisionId}`;grouped.set(key,[...(grouped.get(key)??[]),item])}
  const recordsById=new Map(input.records.map((record)=>[record.id,record]))
  const categories=await admin.from('categories').select('key,label')
  if(categories.error)throw new Error('Weekly review category labels could not be loaded.')
  const categoryLabels=Object.fromEntries((categories.data??[]).map((row)=>[String(row.key),String(row.label)]))
  const items=[...grouped.values()].map((values)=>{const record=recordsById.get(values[0].recordId)
    const decision=record?currentDecision(record):null
    const categoryLabel=reviewCategoryLabel(
      decision?.allocations.filter((allocation)=>allocation.kind==='business')
        .map((allocation)=>allocation.taxCategoryKey)??[],categoryLabels)
    return {bookkeepingRecordId:values[0].recordId,
    bookkeepingDecisionId:values[0].decisionId,activityRole:values[0].metric==='business_income'?'income':'expense',
    displayLabel:record?.merchant?.trim()||record?.description?.trim()||
      (values[0].metric==='business_income'?'Business income':'Business purchase'),
    treatment:decision?.treatment==='mixed_use'?'mixed_use':'business',
    categoryLabel,
    financialTransactionId:record?.financialTransactionId??null,
    signedBusinessAmountCents:values.reduce((sum,item)=>sum+item.signedAmountCents,0),occurredOn:values[0].occurredOn,
    evidenceFingerprint:fingerprint(values)}})
  const identity=items.map((item)=>({recordId:item.bookkeepingRecordId,decisionId:item.bookkeepingDecisionId,
    amount:item.signedBusinessAmountCents,categoryLabel:item.categoryLabel})).sort((a,b)=>a.recordId.localeCompare(b.recordId))
  const personalExcludedCount=input.records.filter((record)=>{
    const decision=currentDecision(record);return decision&&['personal','excluded'].includes(decision.treatment)
  }).length
  const missingDocumentationCount=input.records.filter((record)=>{const decision=currentDecision(record)
    return decision?.bookkeepingNature==='expense'&&['business','mixed_use'].includes(decision.treatment)
      &&!record.hasEvidence}).length
  const snapshotResult=await admin.rpc('present_bookkeeping_weekly_review',{p_business_id:input.businessId,
    p_review_period_id:input.period.id,p_expected_event_id:input.predecessorId,p_membership_scope:input.scope,
    p_currency:'USD',p_income_cents:input.scope==='business'?summary.businessIncomeCents:null,
    p_expense_cents:summary.businessExpensesCents,p_unresolved_question_count:input.unresolvedQuestionCount,
    p_personal_excluded_count:personalExcludedCount,p_missing_documentation_count:missingDocumentationCount,
    p_activity_fingerprint:fingerprint(identity),p_items:items})
  if(snapshotResult.error)throw new Error(`Weekly review could not be presented: ${snapshotResult.error.message}`)
  return true
}

/** Repeated, bounded worker pass. It never copies question rows into a period. */
export async function prepareWeeklyReviews(input:{admin?:SupabaseClient;asOf?:string;limit?:number;businessId?:string}={}) {
  const admin=input.admin??createServerAdminSupabase()
  let cadenceQuery=admin.from('current_business_review_cadence').select('*')
  if(input.businessId)cadenceQuery=cadenceQuery.eq('business_id',input.businessId)
  const cadenceResult=await cadenceQuery.limit(Math.min(input.limit??12,50))
  if(cadenceResult.error)throw new Error('Weekly review cadence could not be loaded.')
  let opened=0,presented=0,waiting=0
  for(const cadence of cadenceResult.data??[]){
    const asOf=input.asOf??dateInTimezone(new Date(),String(cadence.timezone_name))
    const businessId=String(cadence.business_id),weekday=Number(cadence.check_in_weekday)
    await settlePriorReviews(admin,businessId,asOf)
    const checkInDate=latestCheckInOnOrBefore(asOf,weekday)
    if(checkInDate<String(cadence.effective_from))continue
    const membershipResult=await admin.from('business_memberships').select('plan,lifecycle')
      .eq('business_id',businessId).maybeSingle()
    const membership=membershipResult.data
    if(!membership||!['active','payment_issue','canceling'].includes(membership.lifecycle))continue
    const existingResult=await admin.from('bookkeeping_review_periods').select('*').eq('business_id',businessId)
      .eq('check_in_date',checkInDate).maybeSingle()
    let period=existingResult.data as Row|null
    const repository=new SupabaseCanonicalFinancialSummaryRepository(admin)
    if(!period){
      const previous=await admin.from('bookkeeping_review_periods').select('period_end').eq('business_id',businessId)
        .order('period_end',{ascending:false}).limit(1).maybeSingle()
      const boundary=nextReviewPeriod({checkInDate,checkInWeekday:weekday,previousPeriodEnd:previous.data?.period_end??null})
      const loaded=await repository.loadRecords({businessId,periodStart:boundary.periodStart,periodEnd:boundary.periodEnd})
      const questions=await outstandingQuestions(admin,businessId,periodRecordIds(loaded.records,boundary.periodStart,boundary.periodEnd))
      const relevant=loaded.records.some((record)=>{const decision=currentDecision(record);return decision
        && (membership.plan==='business'||decision.bookkeepingNature==='expense')})||questions>0
      if(!relevant)continue
      const created=await admin.from('bookkeeping_review_periods').insert({business_id:businessId,
        period_start:boundary.periodStart,period_end:boundary.periodEnd,check_in_date:checkInDate,
        cadence_event_id:cadence.id,membership_scope:membership.plan,model_version:1}).select('*').single()
      if(created.error)throw new Error(`Weekly review period could not be opened: ${created.error.message}`)
      period=created.data as Row
    }
    const loaded=await repository.loadRecords({businessId,periodStart:String(period.period_start),periodEnd:String(period.period_end)})
    const questions=await outstandingQuestions(admin,businessId,periodRecordIds(loaded.records,String(period.period_start),String(period.period_end)))
    const events=await admin.from('bookkeeping_review_period_events').select('*').eq('review_period_id',period.id)
      .order('sequence_number',{ascending:false}).limit(1)
    let leaf=events.data?.[0] as Row|undefined
    if(!leaf){const id=await appendEvent(admin,{businessId,periodId:String(period.id),predecessorId:null,sequence:1,type:'opened'});
      leaf={id,sequence_number:1,event_type:'opened'};opened+=1}
    const workflow=await admin.from('bookkeeping_weekly_review_workflow_events').select('id,supersedes_event_id,stage,event_type')
      .eq('review_period_id',period.id)
    if(workflow.error&&workflow.error.code!=='42P01')throw new Error('Weekly review workflow state could not be loaded.')
    const supersededWorkflowEvents=new Set((workflow.data??[]).map(event=>event.supersedes_event_id).filter(Boolean))
    const workflowLeaf=(workflow.data??[]).find(event=>!supersededWorkflowEvents.has(event.id))
    const workflowReady=workflowLeaf?.stage==='final'&&workflowLeaf?.event_type==='stage_completed'
    if(!workflowReady){waiting+=1;continue}
    if(['opened','questions_pending','ready','reopened'].includes(String(leaf.event_type))&&await present(admin,{businessId,
      period,scope:membership.plan as 'expenses'|'business',predecessorId:String(leaf.id),sequence:Number(leaf.sequence_number)+1,
      unresolvedQuestionCount:questions,
      records:loaded.records}))presented+=1
  }
  return{opened,presented,waiting}
}
