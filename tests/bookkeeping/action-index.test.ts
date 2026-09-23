import {describe,it,expect} from 'vitest'
import {buildActionIndex,actionIndexValidUntil} from '../../app/lib/bookkeeping/action-index-model'
import {projectBettiWork,type WorkContext,type WorkRecord} from '../../app/lib/bookkeeping/betti-work'
import type {CustomerQuestion} from '../../app/lib/bookkeeping/customer-questions'
const asOf='2026-09-18T12:00:00.000Z'
function context():WorkContext{return{business:{id:'b',start:'2026-01-01',activation:'2026-09-01',activationEvidence:'2026-09-01T00:00:00Z',timezone:'America/Phoenix',coverageStart:'2026-01-01',authorizedScope:{businessId:'b',selectedStart:'2026-01-01',authorizedStart:'2026-01-01',includedStart:'2026-08-01',activation:'2026-09-01',historicalAuthorized:true,currentFrom:'2026-09-01',catchUp:{from:'2026-01-01',through:'2026-08-31'}}},records:[],accounts:[],links:[],documents:[],documentRecords:[],jobs:[],coverage:[],deferred:[],guidedReviews:[],specialDeferrals:[]}}
function record(id:string,date='2026-05-03'):WorkRecord{return{business_id:'b',record_id:id,activity_date:date,account_id:'account',decision_id:'d-'+id,treatment:'unresolved',bookkeeping_nature:'expense',amount_cents:-10000,source_kind:'financial_transaction',has_receipt:false,receipt_unavailable:false,allocations:[]}}
function question(r:WorkRecord):CustomerQuestion{return{id:'q-'+r.record_id,version:'qv-'+r.record_id,source:'bookkeeping',kind:'business_use',recordId:r.record_id,openedAt:'2026-09-18T10:05:00Z',contextFingerprint:'fp',prompt:'Was this for your business?',transaction:{merchant:'Example',amountCents:r.amount_cents,currency:'USD',date:r.activity_date}}}
function prepared(name:string){const c=context();let questions:CustomerQuestion[]=[]
 if(name!=='new')c.records=[record('old'),record('current','2026-09-17')]
 if(name==='out-of-scope'){c.records=[record('old')];c.business.authorizedScope={...c.business.authorizedScope,authorizedStart:'2026-08-01',historicalAuthorized:false,currentFrom:'2026-08-01',catchUp:null}}
 if(name==='account')c.accounts=[{business_id:'b',id:'account',designation:null,use_version:null}]
 if(['personal','mixed','receipt','receipt-confirmation'].includes(name)){
  c.accounts=[{business_id:'b',id:'account',designation:name==='mixed'?'mixed':'business_only',use_version:'account-v1'}]
  for(const r of c.records){r.review_version='rv';r.transaction_id=r.record_id;r.treatment=name==='mixed'?'unresolved':'business';r.allocations=[{kind:'business',amountCents:-10000,category:'software'}]}
  if(name.startsWith('receipt')){for(const r of c.records)r.customer_authored=true}
  if(name==='receipt-confirmation')c.guidedReviews=[{business_id:'b',id:'upload',action:'receipt_upload_sweep',disposition:'completed',created_at:asOf,deferred_until:null,items:c.records.map(r=>({recordId:r.record_id,accountUseVersion:'account-v1'}))}]
 }
 if(name==='special'){c.records[0].bookkeeping_nature='loan_principal_payment';c.records[1].bookkeeping_nature='refund'}
 if(name==='processing')c.jobs=[{business_id:'b',id:'job',record_id:'old',document_id:null,receipt_id:null,state:'processing',kind:'bookkeeping',available_at:asOf,updated_at:asOf,lease_expires_at:'2026-09-18T12:00:20Z'}]
 if(name==='deferred')c.deferred=[{business_id:'b',id:'defer',issue_id:'q-old',record_id:'old',created_at:asOf,deferred_until:'2026-09-20T12:00:00Z'}]
 if(['questions','processing','out-of-scope','deferred'].includes(name))questions=c.records.filter(r=>name!=='deferred'||r.record_id!=='old').map(question)
 return{businessId:'b',context:c,questions,commandItems:[],asOf,processingEnabled:true}
}
describe('canonical action index publication',()=>{
 it.each(['new','account','personal','mixed','receipt','receipt-confirmation','special','questions','processing','deferred','out-of-scope'])('preserves canonical actions and both continuity variants: %s',name=>{
  const input=prepared(name),built=buildActionIndex(input)
  const original=projectBettiWork(input)
  expect(built.work).toEqual(original)
  expect(built.entries.map(e=>e.action)).toEqual([...original.customer.actionable,...original.customer.deferred,...original.betti.waiting])
  for(const hint of [undefined,...input.context.records.map(r=>r.record_id)]){
   const projected=projectBettiWork({...input,continuityRecordId:hint})
   const candidates=built.entries.map(e=>hint&&e.action.recordIds.includes(hint)?{...e.action,priority:e.continuityPriority}:e.action)
    .filter(a=>a.status==='actionable').sort((a,b)=>(b.priority.routingTier??0)-(a.priority.routingTier??0)||b.priority.score-a.priority.score||a.id.localeCompare(b.id))
   expect(candidates[0]??null).toEqual(projected.nextAction)
  }
 })
 it.each(['payout','insurance'])('retains evidence-specific questions identically in full and indexed projection: %s',kind=>{
  const input=prepared('questions')
  input.questions[0]={...input.questions[0],kind:kind==='payout'?'transaction_type':'business_purpose',
   understanding:kind==='payout'?'This looks like customer payments from a processor.':'I know this was an insurance payment for your business.',
   prompt:kind==='payout'?'Is that right?':'What did the insurance cover?',
   ...(kind==='payout'?{confirmation:{optionId:'earned_money',label:'Yes, that’s right'}}:{})}
  const built=buildActionIndex(input),full=projectBettiWork(input)
  expect(built.work.nextAction).toEqual(full.nextAction)
  expect(built.entries.find(e=>e.action.question?.id===input.questions[0].id)?.action.question).toEqual(input.questions[0])
 })
 it('retains more than a thousand legitimate canonical actions with exact continuity',()=>{
  const c=context();c.records=Array.from({length:1001},(_,i)=>record('r-'+i));const input={businessId:'b',context:c,questions:c.records.map(question),commandItems:[],asOf,processingEnabled:true}
  const built=buildActionIndex(input);expect(built.entries.length).toBe(1001)
  const expected=projectBettiWork({...input,continuityRecordId:'r-999'}).nextAction!
  const entry=built.entries.find(e=>e.action.id===expected.id)!
  expect({...entry.action,priority:entry.continuityPriority}).toEqual(expected)
 })
 it('does not publish cross-tenant records',()=>{const i=prepared('questions');i.context.records[0].business_id='other';expect(()=>buildActionIndex(i)).toThrow('tenant')})
 it('refreshes an expiring lease summary without expiring unrelated action eligibility',()=>{const i=prepared('processing');expect(actionIndexValidUntil(i.context,i.questions,asOf,true)).toBe('2026-09-18T12:00:20.000Z');expect(actionIndexValidUntil(i.context,i.questions,asOf)>'2026-09-18T12:00:20.000Z').toBe(true)})
 it('expires before a deferred fact becomes available',()=>{const i=prepared('deferred');i.context.deferred[0].deferred_until='2026-09-18T12:00:02Z';expect(actionIndexValidUntil(i.context,i.questions,asOf)).toBe('2026-09-18T12:00:02.000Z')})
 it('does not freeze daily age priority between two actions',()=>{const i=prepared('questions');i.questions[0].openedAt='2026-09-17T12:00:04Z';expect(actionIndexValidUntil(i.context,i.questions,asOf)).toBe('2026-09-18T12:00:04.000Z')})
 it('expires at business midnight before historical policy changes',()=>{const c=context();const now='2026-09-18T06:59:59.000Z';expect(actionIndexValidUntil(c,[],now)).toBe('2026-09-18T07:00:00.000Z')})
 it('never uses missing receipt as loss of organized working treatment',()=>{const i=prepared('receipt'),built=buildActionIndex(i);expect(built.work.progress.catchUp.organized).toBe(1);expect(built.work.progress.current.organized).toBe(1)})
})


it('publishes the same render-ready set for unknown evidence, linked evidence, and settled reassessment',()=>{
 const input=prepared('questions')
 input.context.jobs=[{business_id:'b',id:'evidence',record_id:null,document_id:'document',receipt_id:null,state:'processing',kind:'document',available_at:asOf,lease_expires_at:'2026-09-18T12:10:00Z',updated_at:asOf}]
 for(const phase of ['unassigned','linked','settled']){
  if(phase==='linked')input.context.documentRecords=[{business_id:'b',document_id:'document',record_id:'old'}]
  if(phase==='settled'){input.context.jobs=[];input.questions=input.questions.filter(q=>q.recordId!=='old')}
  const canonical=projectBettiWork(input),indexed=buildActionIndex(input)
  expect(indexed.work.nextAction).toEqual(canonical.nextAction)
  expect(indexed.entries.filter(e=>e.action.status==='actionable').map(e=>e.action)).toEqual(canonical.customer.actionable)
  if(phase==='unassigned')expect(canonical.nextAction).toBeNull()
  else expect(canonical.nextAction?.recordIds).toEqual(['current'])
 }
})
