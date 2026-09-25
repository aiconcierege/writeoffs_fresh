import {describe,it,expect} from 'vitest'
import {projectBettiWork,type WorkContext,type WorkRecord} from '../../app/lib/bookkeeping/betti-work'
import type {CustomerQuestion} from '../../app/lib/bookkeeping/customer-questions'
const now='2026-09-23T20:00:00Z'
function fixture(){
 const c:WorkContext={business:{id:'b',start:'2026-01-01',activation:'2026-09-23',activationEvidence:now,timezone:'America/Phoenix',coverageStart:'2026-01-01',authorizedScope:{businessId:'b',selectedStart:'2026-01-01',authorizedStart:'2026-01-01',includedStart:'2026-08-01',activation:'2026-09-23',historicalAuthorized:true,currentFrom:'2026-08-01',catchUp:{from:'2026-01-01',through:'2026-07-31'}}},records:[],accounts:[{business_id:'b',id:'account',provider:'statement',use_version:'use',designation:'business_only'}],jobs:[],documents:[],links:[],coverage:[],deferred:[],guidedReviews:[],catchUpEvents:[]}
 const record:WorkRecord={business_id:'b',record_id:'printing',account_id:'account',activity_date:'2026-05-09',decision_id:'decision',review_version:'review',transaction_id:'transaction',merchant:'Desert Print Shop',bookkeeping_nature:'expense',treatment:'business',amount_cents:-21840,allocations:[{kind:'business',amountCents:-21840,category:'office'}],source_kind:'financial_transaction',has_receipt:false,receipt_unavailable:false}
 c.records=[record]
 const q:CustomerQuestion={id:'purpose',version:'v1',source:'bookkeeping',kind:'business_purpose',recordId:record.record_id,prompt:'What was this purchase for?',openedAt:now,contextFingerprint:'fp',transaction:{merchant:record.merchant!,date:record.activity_date,amountCents:record.amount_cents,currency:'USD'}}
 return{c,q}
}
function project(c:WorkContext,q:CustomerQuestion[]=[]){return projectBettiWork({businessId:'b',context:c,questions:q,asOf:now})}
function respond(c:WorkContext,response:'continue'|'none'|'later'|'uploaded'|'reviewed',q:CustomerQuestion[]=[]){
 const action=project(c,q).nextAction!
 if(!action.journey)throw Error('Expected journey stage')
 c.catchUpEvents!.push({business_id:'b',id:`event-${c.catchUpEvents!.length}`,scope_key:action.journey.scopeKey,
  stage:action.journey.stage,response,items:action.items??[],document_ids:response==='uploaded'?['doc']:[],created_at:now})
}
describe('catch-up V2 authoritative journey',()=>{
 it('does not ask a connected account for historical statement files',()=>{
  const {c}=fixture();c.accounts[0].provider='plaid'
  expect(project(c).nextAction?.journey?.stage).toBe('receipts')
 })
 it('does not enroll current-only activity in historical bulk reviews',()=>{
  const {c,q}=fixture();c.records[0].activity_date='2026-09-22';c.records[0].has_receipt=true
  const question={...q,transaction:{...q.transaction,date:'2026-09-22'}}
  expect(project(c,[question]).nextAction?.question?.id).toBe('purpose')
  expect(project(c,[question]).customer.actionable.some(a=>a.journey)).toBe(false)
 })
 it('uses the reassessed question set after receipts, with no stale question or fixed count',()=>{
  const {c,q}=fixture();respond(c,'continue',[q]);respond(c,'uploaded',[q])
  c.records[0].has_receipt=true
  // The canonical evidence engine supplies a narrower remaining fact, never
  // the old projected purpose question. Orchestration must preserve that set.
  const narrowed={...q,id:'remaining-allocation',kind:'percentage' as const,prompt:'About how much was for business?'}
  respond(c,'continue',[narrowed]);respond(c,'reviewed',[narrowed]);respond(c,'reviewed',[narrowed])
  expect(project(c,[narrowed]).nextAction?.question?.id).toBe('remaining-allocation')
  expect(project(c,[narrowed]).customer.substantiveCount).toBe(1)
  expect(project(c,[]).customer.substantiveCount).toBe(0)
  expect(project(c,[]).customer.actionable.some(a=>a.question)).toBe(false)
 })
 it('offers unknown outgoing money for personal exceptions without inventing an expense',()=>{
  const{c,q}=fixture();c.records[0].bookkeeping_nature=null;c.records[0].treatment='unresolved';c.records[0].allocations=[]
  respond(c,'continue',[q])
  expect(project(c,[q]).nextAction?.journey?.stage).toBe('personal')
  respond(c,'reviewed',[q])
  expect(project(c,[q]).nextAction?.question?.id).toBe('purpose')
  expect(c.records[0].treatment).toBe('unresolved');expect(c.records[0].allocations).toEqual([])
 })
 it('does not ask for a receipt when the only activity is a statement-evidenced bank fee',()=>{
  const{c}=fixture();c.records[0].merchant='BANK SERVICE FEE'
  c.records[0].allocations[0].category='fees'
  c.coverage=[{business_id:'b',id:'may',account_id:'account',document_id:'statement',period_start:'2026-05-01',period_end:'2026-05-31',validation_status:'validated',ambiguous_row_count:0}]
  respond(c,'continue')
  expect(project(c).customer.actionable.some(a=>a.journey)).toBe(false)
 })
 it('keeps all financial facts unchanged across statements, no receipts, two broad reviews and the useful question',()=>{
  const{c,q}=fixture(),before=JSON.stringify(c.records)
  expect(project(c,[q]).nextAction?.journey?.stage).toBe('statements')
  respond(c,'continue',[q]);expect(project(c,[q]).nextAction?.journey?.stage).toBe('receipts')
  expect(project(c,[q]).customer.substantiveCount).toBe(0)
  respond(c,'none',[q]);expect(project(c,[q]).nextAction?.journey?.stage).toBe('personal')
  respond(c,'reviewed',[q]);expect(project(c,[q]).nextAction?.journey?.stage).toBe('nonexpense')
  respond(c,'reviewed',[q]);expect(project(c,[q]).nextAction?.question?.id).toBe('purpose')
  expect(project(c,[q]).customer.substantiveCount).toBe(1)
  expect(JSON.stringify(c.records)).toBe(before)
 })
 it('upload does not mean all receipts supplied; processing must settle before more/done',()=>{
  const{c,q}=fixture();respond(c,'continue',[q]);respond(c,'uploaded',[q])
  expect(project(c,[q]).nextAction?.journey?.moreReceipts).toBe(true)
  c.jobs=[{business_id:'b',id:'job',record_id:'printing',document_id:'doc',receipt_id:null,state:'processing',kind:'document',available_at:now,updated_at:now,lease_expires_at:'2026-09-23T20:01:00Z'}]
  expect(project(c,[q]).nextAction).toBeNull()
  c.jobs=[];respond(c,'continue',[q])
  expect(project(c,[q]).nextAction?.journey?.stage).toBe('personal')
 })
 it('shows explicit gaps without requiring missing statements',()=>{
  const{c,q}=fixture();c.coverage=[{business_id:'b',id:'period',account_id:'account',document_id:'statement',period_start:'2026-05-01',period_end:'2026-05-31',validation_status:'validated',ambiguous_row_count:0}]
  expect(project(c,[q]).nextAction?.journey?.missingPeriods).toEqual([{from:'2026-01-01',through:'2026-04-30'},{from:'2026-06-01',through:'2026-07-31'}])
  respond(c,'later',[q]);expect(project(c,[q]).nextAction?.journey?.stage).toBe('receipts')
 })
 it('skips missing-period collection when all statements are present',()=>{
  const{c}=fixture();c.coverage=[{business_id:'b',id:'period',account_id:'account',document_id:'statement',period_start:'2026-01-01',period_end:'2026-07-31',validation_status:'validated',ambiguous_row_count:0}]
  expect(project(c).nextAction?.journey?.stage).toBe('receipts')
 })
 it('never presumes business use for a mixed account',()=>{
  const{c,q}=fixture();c.accounts[0].designation='business_and_personal';c.records[0].treatment='unresolved';c.records[0].allocations=[]
  respond(c,'continue',[q]);respond(c,'later',[q])
  expect(project(c,[q]).nextAction?.question?.id).toBe('purpose')
  expect(c.records[0].treatment).toBe('unresolved')
 })
 it('bounds review pages and does not review an already seen record twice',()=>{
  const{c}=fixture();c.records=Array.from({length:45},(_,i)=>({...c.records[0],record_id:`record-${String(i).padStart(2,'0')}`}))
  respond(c,'continue');respond(c,'none')
  const first=project(c).nextAction!;expect(first.items).toHaveLength(20)
  respond(c,'reviewed');const second=project(c).nextAction!
  expect(second.items).toHaveLength(20)
  expect(second.recordIds.some(id=>first.recordIds.includes(id))).toBe(false)
 })
 it('keeps current questions ahead of historical collection',()=>{
  const{c,q}=fixture();c.records.push({...c.records[0],record_id:'current',activity_date:'2026-09-22',has_receipt:true})
  const recent={...q,id:'current-question',recordId:'current',transaction:{...q.transaction,date:'2026-09-22'}}
  expect(project(c,[q,recent]).nextAction?.question?.id).toBe('current-question')
 })
 it('keeps unfinished covered August ongoing in October without enrolling it in catch-up reviews',()=>{
  const{c,q}=fixture()
  c.records.push({...c.records[0],record_id:'covered-august',activity_date:'2026-08-12',has_receipt:true})
  const august={...q,id:'august-question',recordId:'covered-august',transaction:{...q.transaction,date:'2026-08-12'}}
  const september=project(c,[q,august])
  const october=projectBettiWork({businessId:'b',context:c,questions:[q,august],asOf:'2026-10-23T20:00:00Z'})
  expect(october.nextAction?.question?.id).toBe('august-question')
  expect(october.nextAction?.workstream).toBe('current')
  const before=september.customer.actionable.find(a=>a.journey)?.journey
  const after=october.customer.actionable.find(a=>a.journey)?.journey
  expect(after).toEqual(before)
  expect(after?.through).toBe('2026-07-31')
  expect(october.customer.actionable.filter(a=>a.journey).flatMap(a=>a.recordIds)).not.toContain('covered-august')
 })
 it('does not offer known transfers, loan principal, card payments or personal records as proposed expenses',()=>{
  const{c}=fixture();for(const nature of ['transfer','loan_principal_payment','credit_card_payment'])c.records.push({...c.records[0],record_id:nature,bookkeeping_nature:nature,treatment:'excluded'})
  c.records.push({...c.records[0],record_id:'personal',treatment:'personal'})
  respond(c,'continue');respond(c,'none')
  expect(project(c).nextAction?.recordIds).toEqual(['printing'])
 })
 it('does not use another tenant’s journey history',()=>{
  const{c}=fixture();respond(c,'later');c.catchUpEvents![0].business_id='other'
  expect(()=>project(c)).toThrow()
 })
})
