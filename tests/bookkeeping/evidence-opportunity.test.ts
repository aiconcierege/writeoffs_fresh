import {describe,it,expect} from 'vitest'
import {projectBettiWork,type WorkContext,type WorkRecord} from '../../app/lib/bookkeeping/betti-work'
import type {CustomerQuestion} from '../../app/lib/bookkeeping/customer-questions'
const now='2026-09-23T20:00:00Z'
function fixture(){
 const c:WorkContext={business:{id:'b',start:'2026-01-01',activation:'2026-09-23',activationEvidence:now,timezone:'America/Phoenix',coverageStart:'2026-01-01',authorizedScope:{businessId:'b',selectedStart:'2026-01-01',authorizedStart:'2026-01-01',includedStart:'2026-08-01',activation:'2026-09-23',historicalAuthorized:true,currentFrom:'2026-08-01',catchUp:{from:'2026-01-01',through:'2026-07-31'}}},records:[],accounts:[{business_id:'b',id:'account',use_version:'use',designation:'business_only'}],jobs:[],documents:[],links:[],coverage:[],deferred:[],guidedReviews:[]}
 const record:WorkRecord={business_id:'b',record_id:'printing',account_id:'account',activity_date:'2026-05-09',decision_id:'decision',review_version:'review',transaction_id:'transaction',merchant:'Desert Print Shop',bookkeeping_nature:'expense',treatment:'business',amount_cents:-21840,allocations:[{kind:'business',amountCents:-21840,category:'office'}],source_kind:'financial_transaction',has_receipt:false,receipt_unavailable:false}
 c.records=[record]
 const q:CustomerQuestion={id:'purpose',version:'v1',source:'bookkeeping',kind:'business_purpose',recordId:record.record_id,prompt:'What was this purchase for?',openedAt:now,contextFingerprint:'fp',transaction:{merchant:record.merchant!,date:record.activity_date,amountCents:record.amount_cents,currency:'USD'}}
 return{c,q}
}
function project(c:WorkContext,q:CustomerQuestion[]=[]){return projectBettiWork({businessId:'b',context:c,questions:q,asOf:now})}
describe('evidence before questions without another bookkeeping engine',()=>{
 it('offers evidence before a material purchase question and preserves allocations',()=>{
  const{c,q}=fixture(),before=JSON.stringify(c)
  expect(project(c,[q]).nextAction?.type).toBe('evidence_opportunity')
  expect(project(c,[q]).customer.actionable.some(a=>a.question?.id==='purpose')).toBe(true)
  expect(JSON.stringify(c)).toBe(before)
 })
 it.each(['none','later','provided'] as const)('%s proceeds to specific facts without another receipt stage',response=>{
  const{c,q}=fixture()
  c.guidedReviews=[{business_id:'b',id:'response',action:'evidence_opportunity',disposition:response==='later'?'deferred':'completed',created_at:now,deferred_until:null,items:[],answers:{response,accountId:'account',month:'2026-05'}}]
  const p=project(c,[q])
  expect(p.nextAction?.question?.id).toBe('purpose')
  expect(p.customer.actionable.some(a=>a.type.startsWith('receipt')||a.type==='evidence_opportunity')).toBe(false)
  expect(c.records[0].allocations[0].amountCents).toBe(-21840)
  // The projection cannot invent a receipt-unavailable assertion from Later.
  expect(c.records[0].receipt_unavailable).toBe(false)
 })
 it('waits for new evidence even after the opportunity was acknowledged',()=>{
  const{c,q}=fixture()
  c.guidedReviews=[{business_id:'b',id:'upload',action:'evidence_opportunity',disposition:'completed',created_at:now,deferred_until:null,items:[],answers:{response:'provided',accountId:'account',month:'2026-05'}}]
  c.jobs=[{business_id:'b',id:'extract',record_id:null,document_id:'doc',receipt_id:null,state:'processing',kind:'document',available_at:now,lease_expires_at:'2026-09-23T20:01:00Z',updated_at:now}]
  expect(project(c,[q]).nextAction).toBeNull()
  expect(project(c,[q]).betti.waiting[0].question?.id).toBe('purpose')
  c.jobs=[];c.records[0].has_receipt=true
  expect(project(c,[]).customer.actionable.every(a=>!a.question)).toBe(true)
 })
 it('does not repeat continuous current-month invitations, but keeps another account separate',()=>{
  const{c}=fixture()
  c.guidedReviews=[{business_id:'b',id:'later',action:'evidence_opportunity',disposition:'deferred',created_at:now,deferred_until:null,items:[],answers:{response:'later',accountId:'account',month:'2026-05'}}]
  c.records.push({...c.records[0],record_id:'later-record'})
  expect(project(c).customer.actionable.some(a=>a.type==='evidence_opportunity')).toBe(false)
  c.accounts.push({...c.accounts[0],id:'other'})
  c.records.push({...c.records[0],record_id:'other-account-record',account_id:'other'})
  expect(project(c).nextAction?.recordIds).toEqual(['other-account-record'])
 })
 it('keeps current facts ahead of historical evidence collection',()=>{
  const{c,q}=fixture()
  c.records.push({...c.records[0],record_id:'current',activity_date:'2026-09-22',has_receipt:true})
  const current={...q,id:'current-fact',recordId:'current',transaction:{...q.transaction,date:'2026-09-22'}}
  expect(project(c,[q,current]).nextAction?.question?.id).toBe('current-fact')
 })
 it('finishes the uploaded month batch before its other questions, without holding current work',()=>{
  const{c,q}=fixture()
  c.records.push({...c.records[0],record_id:'may-money',bookkeeping_nature:'business_income',amount_cents:30000},
   {...c.records[0],record_id:'recent-money',activity_date:'2026-09-22',bookkeeping_nature:'business_income',amount_cents:30000})
  c.guidedReviews=[{business_id:'b',id:'upload',action:'evidence_opportunity',disposition:'completed',created_at:now,deferred_until:null,items:[],answers:{response:'provided',accountId:'account',month:'2026-05',documentIds:['doc']}}]
  c.documentRecords=[{business_id:'b',document_id:'doc',record_id:'printing'}]
  c.jobs=[{business_id:'b',id:'reassess',record_id:'printing',document_id:null,receipt_id:null,state:'pending',kind:'bookkeeping',available_at:now,lease_expires_at:null,updated_at:now}]
  const may={...q,id:'may-fact',recordId:'may-money'},recent={...q,id:'recent-fact',recordId:'recent-money'}
  const waiting=project(c,[q,may,recent])
  expect(waiting.customer.actionable.map(a=>a.question?.id)).toEqual(['recent-fact'])
  expect(waiting.betti.waiting.map(a=>a.question?.id).sort()).toEqual(['may-fact','purpose'])
  c.jobs=[];c.records[0].has_receipt=true
  expect(project(c,[may,recent]).customer.actionable.some(a=>a.question?.id==='may-fact')).toBe(true)
 })
 it.each(['business_income','transfer','credit_card_payment','loan_principal_payment','refund'])('does not ask for a purchase receipt for %s',nature=>{
  const{c}=fixture();c.records[0].bookkeeping_nature=nature
  expect(project(c).customer.actionable.some(a=>a.type==='evidence_opportunity')).toBe(false)
 })
 it('rejects another tenant’s opportunity history',()=>{
  const{c}=fixture();c.guidedReviews=[{business_id:'foreign',id:'bad',action:'evidence_opportunity',disposition:'completed',created_at:now,deferred_until:null,items:[]}]
  expect(()=>project(c)).toThrow('tenant')
 })
})
