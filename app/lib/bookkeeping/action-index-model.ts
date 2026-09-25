import type { CanonicalWeeklyReviewItem } from './model'
import {projectBettiWork,type BettiWorkProjection,type WorkAction,type WorkContext} from './betti-work'
import type {CustomerQuestion} from './customer-questions'

export const ACTION_INDEX_VERSION='betti-action-index:v8-special-uncertainty'
export type ActionIndexFreshness={version:1;revision:number;publishedRevision:number;summaryCurrent:boolean;summaryAsOf:string;state:'ready'|'processing'|'queued'|'retry_scheduled'}
export type IndexedWorkProjection=BettiWorkProjection&{index:ActionIndexFreshness}
export type ActionIndexEntry={action:WorkAction;commandItem:CanonicalWeeklyReviewItem|null;continuityPriority:WorkAction['priority']}

/** Expire before any clock-derived eligibility, priority, or lease fact can change.
 * This is a derived refresh deadline, not a fixed user-session quota or data TTL. */
export function actionIndexValidUntil(context:WorkContext,questions:CustomerQuestion[],asOf:string,includeProcessingSummary=false){
 const now=Date.parse(asOf),times:number[]=[]
 const nextDaily=(value:string|null|undefined)=>{
  if(!value)return
  const at=Date.parse(value);if(!Number.isFinite(at))return
  times.push(at+Math.max(0,Math.floor((now-at)/86400000)+1)*86400000)
 }
 nextDaily(asOf.slice(0,10))
 nextDaily(context.business.activationEvidence)
 for(const r of context.records)nextDaily(r.activity_date)
 for(const q of questions){nextDaily(q.openedAt);if(q.availableAt)times.push(Date.parse(q.availableAt))}
 for(const d of context.deferred){nextDaily(d.created_at);if(d.deferred_until)times.push(Date.parse(d.deferred_until))}
 for(const d of context.specialDeferrals??[])times.push(Date.parse(d.created_at)+7*86400000)
 for(const d of context.guidedReviews??[])if(d.deferred_until)times.push(Date.parse(d.deferred_until))
 // A lease becoming stale changes processing status, not action eligibility:
 // the canonical engine still holds that job's dependent actions. Independent
 // ready actions must survive the unrelated processing-summary deadline.
 if(includeProcessingSummary)for(const j of context.jobs){times.push(Date.parse(j.available_at));if(j.lease_expires_at)times.push(Date.parse(j.lease_expires_at))}
 // Historical policy uses the business calendar. Find its next date transition,
 // including DST, without assuming a fixed UTC offset.
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:context.business.timezone,year:'numeric',month:'2-digit',day:'2-digit'})
 const today=formatter.format(new Date(now));let low=now,high=now+26*3600000
 while(high-low>1){const mid=Math.floor((low+high)/2);if(formatter.format(new Date(mid))===today)low=mid;else high=mid}
 times.push(high)
 return new Date(Math.min(...times.filter(t=>Number.isFinite(t)&&t>now))).toISOString()
}

/** Build both priority variants with the existing engine. SQL selects/sorts these
 * values; it does not duplicate eligibility or the continuity scoring policy. */
export function buildActionIndex(input:{businessId:string;context:WorkContext;questions:CustomerQuestion[];asOf:string;processingEnabled:boolean;commandItems:CanonicalWeeklyReviewItem[]}){
 const work=projectBettiWork(input)
 const all=[...work.customer.actionable,...work.customer.deferred,...work.betti.waiting]
 const variant=projectBettiWork({...input,continuityRecordIds:new Set(input.context.records.map(r=>r.record_id))})
 const variants=new Map([...variant.customer.actionable,...variant.customer.deferred,...variant.betti.waiting].map(a=>[a.id,a]))
 const entries:ActionIndexEntry[]=all.map(action=>{
  const record=action.recordIds[0]
  let continuityPriority=action.priority
  if(record){
   const alternative=variants.get(action.id)
   if(!alternative||alternative.version!==action.version)throw new Error('Continuity changed action eligibility')
   continuityPriority=alternative.priority
  }
  const item=action.question?.source==='bookkeeping'?input.commandItems.find(i=>i.event.reviewIssueId===action.question!.id&&i.event.id===action.question!.version)??null:null
  return {action,commandItem:item,continuityPriority}
 })
 return{work,entries,validUntil:actionIndexValidUntil(input.context,input.questions,input.asOf),
  summaryValidUntil:actionIndexValidUntil(input.context,input.questions,input.asOf,true)}
}
