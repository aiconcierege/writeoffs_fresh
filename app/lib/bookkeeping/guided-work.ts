import type { WorkContext, WorkRecord } from './betti-work'
export type SweepType = 'personal_exception_sweep'|'mixed_use_sweep'|'receipt_upload_sweep'|'receipt_availability'|'evidence_opportunity'
export type GuidedItem = {recordId:string;decisionId:string;reviewVersion:string;accountUseVersion:string;merchant:string;date:string;amountCents:number;transactionId:string}
export type GuidedReview = {business_id:string;id:string;action:SweepType;disposition:'completed'|'deferred';created_at:string;deferred_until:string|null;items:(Pick<GuidedItem,'recordId'|'accountUseVersion'>&{date?:string})[];answers?:{response?:'provided'|'none'|'later';accountId?:string;month?:string;documentIds?:string[]}}
export const GUIDED_BATCH_LIMIT=8
// One coherent exception review, bounded like the existing 100-purchase bulk review.
export const PERSONAL_SWEEP_LIMIT=100

/** An opportunity is not a documentation mandate or an accounting conclusion.
 * Acknowledgment suppresses repeat invitations for this account/month, including
 * continuously arriving current activity. Documents can still arrive any time. */
export function evidenceOpportunityHandled(r:WorkRecord,c:WorkContext){
 return (c.guidedReviews??[]).some(e=>e.action==='evidence_opportunity'
  ?e.answers?.accountId===r.account_id&&e.answers.month===r.activity_date.slice(0,7)
  :['receipt_upload_sweep','receipt_availability'].includes(e.action)&&e.disposition==='completed'
   &&e.items.some(i=>i.recordId===r.record_id))
}
export function evidenceOpportunityEligible(r:WorkRecord,c:WorkContext,asOf:string){
 return Boolean(r.account_id&&r.review_version&&r.decision_id&&r.transaction_id
  &&c.accounts.some(a=>a.id===r.account_id&&a.use_version&&a.designation)
  &&r.source_kind==='financial_transaction'&&r.amount_cents<0&&r.bookkeeping_nature==='expense'
  &&['business','mixed_use','unresolved'].includes(r.treatment??'')
  &&!r.has_receipt&&!r.receipt_unavailable&&!statementEstablishesBankFee(r,c)
  &&!evidenceOpportunityHandled(r,c)&&!guidedDeferral(r,'receipt_upload_sweep',c,asOf)
  &&!(c.guidedReviews??[]).some(e=>e.disposition==='deferred'&&e.deferred_until&&e.deferred_until>asOf
    &&e.items.some(i=>i.recordId===r.record_id)))
}

/** An established bank fee is directly evidenced by the validated statement.
 * Do not generalize this to merchant fees, ambiguous debits, or candidate categories. */
export function statementEstablishesBankFee(r:WorkRecord,c:WorkContext){
 return r.source_kind==='financial_transaction'&&r.bookkeeping_nature==='expense'
  &&r.treatment==='business'&&r.amount_cents<0
  &&/^bank (?:service|maintenance) fee$/i.test((r.merchant??'').trim())
  &&r.allocations.length===1&&r.allocations[0].kind==='business'
  &&r.allocations[0].category==='fees'&&r.allocations[0].amountCents===r.amount_cents
  &&c.accounts.some(a=>a.id===r.account_id&&a.designation==='business_only')
  &&c.coverage.some(p=>p.account_id===r.account_id&&p.validation_status==='validated'
   &&p.ambiguous_row_count===0&&p.period_start&&p.period_end
   &&p.period_start<=r.activity_date&&p.period_end>=r.activity_date)
}
/** Derive the next review from scoped, assessed canonical facts. No category inference. */
export function guidedStage(r:WorkRecord,c:WorkContext,specificFactPending=false):SweepType|null{
 // A specific fact (including a deferred one) owns this record. Generic review
 // must never replace it or circumvent its deferral.
 if(specificFactPending||statementEstablishesBankFee(r,c))return null
 const account=c.accounts.find(a=>a.id===r.account_id)
 if(!r.review_version||!r.decision_id||!account?.use_version||!account.designation||r.source_kind!=='financial_transaction'
  ||r.amount_cents>=0||r.bookkeeping_nature!=='expense'||['personal','excluded'].includes(r.treatment??''))return null
 const done=(action:SweepType)=>(c.guidedReviews??[]).some(e=>e.action===action&&e.disposition==='completed'
  &&e.items.some(i=>i.recordId===r.record_id&&i.accountUseVersion===account.use_version))
 const categories=new Set(r.allocations.filter(a=>a.kind==='business'&&a.category).map(a=>a.category))
 if(!r.customer_authored&&r.treatment!=='mixed_use'&&categories.size<=1){
  if(account.designation==='business_only'&&r.treatment==='business'
   &&r.allocations.some(a=>a.kind==='business')&&!done('personal_exception_sweep'))return 'personal_exception_sweep'
  if(!done('mixed_use_sweep')&&account.designation==='business_and_personal'&&r.treatment==='unresolved')return 'mixed_use_sweep'
 }
 // Receipt opportunities are separate from these use-fact reviews. Never append
 // another generic receipt stage after the customer already had that opportunity.
 return null
}
export function guidedItem(r:WorkRecord,c:WorkContext):GuidedItem{
 return{recordId:r.record_id,decisionId:r.decision_id!,reviewVersion:r.review_version!,accountUseVersion:c.accounts.find(a=>a.id===r.account_id)!.use_version!,
  merchant:r.merchant??'Purchase',date:r.activity_date,amountCents:r.amount_cents,transactionId:r.transaction_id!}
}
export function guidedDeferral(r:WorkRecord,stage:SweepType,c:WorkContext,asOf:string){
 const special=(c.specialDeferrals??[]).filter(d=>d.record_id===r.record_id&&d.decision_id===r.decision_id).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]
 if(special){const until=new Date(Date.parse(special.created_at)+7*86400000).toISOString();if(until>asOf)return until}
 const existing=c.deferred.find(d=>d.record_id===r.record_id&&(!d.deferred_until||d.deferred_until>asOf))
 if(existing)return existing.deferred_until??'9999-01-01T00:00:00Z'
 return(c.guidedReviews??[]).filter(e=>e.action===stage&&e.disposition==='deferred'&&e.deferred_until&&e.deferred_until>asOf
  &&e.items.some(i=>i.recordId===r.record_id&&i.accountUseVersion===c.accounts.find(a=>a.id===r.account_id)?.use_version))
  .sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]?.deferred_until??null
}
