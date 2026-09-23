import {describe,it,expect} from 'vitest'
import {mayChecking} from '../fixtures/may-2026-checking'
import {BOOKKEEPING_EVALUATOR_VERSION,evaluateDeterministicBookkeeping,decisionMatchesProposal,type BookkeepingEvaluationSnapshot} from '../../app/lib/bookkeeping/deterministic-evaluator'
import {buildSharedEvidence} from '../../app/lib/bookkeeping/shared-evidence'
import {classifyOperatingExpense} from '../../app/lib/bookkeeping/operating-expense-classification'
import {payoutUnderstanding} from '../../app/lib/bookkeeping/purchase-understanding'
import {projectBettiWork,type WorkContext,type WorkRecord} from '../../app/lib/bookkeeping/betti-work'
import {buildActionIndex} from '../../app/lib/bookkeeping/action-index-model'
import {aggregateCanonicalFinancialSummary,type CanonicalSummaryRecord} from '../../app/lib/bookkeeping/financial-summary'
import {buildCanonicalReport} from '../../app/lib/bookkeeping/reporting-model'
import type {CustomerQuestion} from '../../app/lib/bookkeeping/customer-questions'
import {guidedStage,statementEstablishesBankFee} from '../../app/lib/bookkeeping/guided-work'

const now='2026-09-23T17:00:00.000Z'
export function syntheticMayScenario(){
 const c:WorkContext={business:{id:'synthetic-may',start:'2026-01-01',activation:'2026-09-23',activationEvidence:now,timezone:'America/Phoenix',coverageStart:'2026-01-01',authorizedScope:{businessId:'synthetic-may',selectedStart:'2026-01-01',authorizedStart:'2026-01-01',includedStart:'2026-08-01',activation:'2026-09-23',historicalAuthorized:true,currentFrom:'2026-09-23',catchUp:{from:'2026-01-01',through:'2026-09-22'}}},records:[],accounts:[{business_id:'synthetic-may',id:'account',provider:'statement',designation:'business_only',use_version:'use-1'}],jobs:[],documents:[],links:[],deferred:[],guidedReviews:[],coverage:[{business_id:'synthetic-may',id:'statement',account_id:'account',document_id:'pdf',period_start:'2026-05-01',period_end:'2026-05-31',validation_status:'validated',ambiguous_row_count:0}]}
 const snapshots:BookkeepingEvaluationSnapshot[]=[],questions:CustomerQuestion[]=[],records:CanonicalSummaryRecord[]=[]
 for(const [day,merchant,amount] of mayChecking){
  const id=`may-${day}`,date=`2026-05-${String(day).padStart(2,'0')}`
  const s:BookkeepingEvaluationSnapshot={evaluatorVersion:BOOKKEEPING_EVALUATOR_VERSION,businessId:c.business.id,recordId:id,sourceKind:'financial_transaction',amountCents:amount,currency:'USD',occurredOn:date,merchantName:merchant,description:merchant,businessDescription:null,activeDocumentCount:0,customerAnswerCount:0,hasOpenConflictingEvidence:false,decisionHistoryLength:1,currentDecision:{id:`d-${id}`,businessId:c.business.id,bookkeepingRecordId:id,supersedesDecisionId:null,bookkeepingNature:null,treatment:'unresolved',reviewStatus:'needs_review',provenance:'system',actorUserId:null,confidence:null,reason:null,businessPurpose:null,allocations:[],createdAt:now},movement:{financialTransactionId:`tx-${id}`,financialAccountId:'account',accountType:'checking',amountCents:amount,currency:'USD',occurredOn:date,sourceCurrent:true,pending:false,structuralHint:null,currentDecisionNature:null,currentDecisionTreatment:'unresolved',currentDecisionProvenance:'system'},movementCandidates:[],accountUse:{eventId:'use-1',designation:'business_only',effectiveAt:now},financialOrigin:{kind:'statement',transactionId:`tx-${id}`,evidenceId:'statement',confidence:null}}
  for(let pass=0;pass<8;pass++){
   s.evidence=buildSharedEvidence(s,[])
   const evaluation=evaluateDeterministicBookkeeping(s)
   if(!evaluation||decisionMatchesProposal(s.currentDecision,evaluation.proposal))break
   s.currentDecision={...s.currentDecision,...evaluation.proposal,provenance:'automation'}
  }
  snapshots.push(s)
  const d=s.currentDecision,classification=classifyOperatingExpense(s)
  const r:WorkRecord={business_id:c.business.id,record_id:id,activity_date:date,account_id:'account',decision_id:d.id,treatment:d.treatment,bookkeeping_nature:d.bookkeepingNature,amount_cents:amount,source_kind:'financial_transaction',has_receipt:false,receipt_unavailable:false,merchant,transaction_id:`tx-${id}`,review_version:`rv-${id}`,customer_authored:false,allocations:d.allocations.map(a=>({kind:a.kind,amountCents:a.amountCents,category:a.taxCategoryKey??null}))}
  c.records.push(r)
  records.push({id,occurredOn:date,amountCents:amount,currency:'USD',financialSourceAssociationId:`source-${id}`,financialTransactionId:`tx-${id}`,merchant,hasEvidence:false,decisions:[{...d,allocations:d.allocations.map((a,i)=>({...a,id:`allocation-${id}-${i}`}))}]})
  const q:CustomerQuestion={id:`q-${id}`,version:`qv-${id}`,recordId:id,source:'bookkeeping',kind:'transaction_type',prompt:amount>0?'What was this money for?':'What kind of activity was this?',materiality:'totals',openedAt:now,transaction:{merchant,date,amountCents:amount,currency:'USD'}}
  if(d.bookkeepingNature===null){const candidate=payoutUnderstanding(s);questions.push({...q,...candidate?{prompt:'Is that right?',confirmation:{optionId:'earned_money',label:'Yes, that’s right'}}:{}})}
  else if(merchant==='VERIZON WIRELESS')questions.push({...q,source:'deduction',kind:'percentage',prompt:'About how much do you use this phone service for your business?'})
  else if(d.bookkeepingNature==='expense'&&classification.status==='needs_facts')questions.push({...q,kind:'business_purpose',materiality:'disclosable',prompt:merchant.includes('INSURANCE')?'What did this insurance cover?':'What was this purchase for?'})
 }
 return{context:c,questions,records,snapshots,businessId:c.business.id,asOf:now,processingEnabled:true,commandItems:[]}
}

describe('controlled May statement: existing evaluation → working books → corrected routing',()=>{
 it('preserves all 24 economic decisions and exact Home/Reports amounts without receipts',()=>{
  const s=syntheticMayScenario(),summary=aggregateCanonicalFinancialSummary({records:s.records,periodStart:'2026-01-01',periodEnd:'2026-09-23',currency:'USD',unresolvedCustomerQuestionCount:s.questions.length})
  const report=buildCanonicalReport({canonicalRecords:s.records,legacyRecords:[],periodStart:'2026-01-01',periodEnd:'2026-09-23',currency:'USD'})
  expect(s.records).toHaveLength(24)
  expect(summary).toMatchObject({businessIncomeCents:210052,businessExpensesCents:142573,businessProfitCents:67479})
  expect(report).toMatchObject({businessIncomeCents:210052,businessExpensesCents:142573,businessProfitCents:67479,uncategorizedBusinessExpensesCents:33715})
  const expected:Record<string,string>={'may-3':'software','may-6':'taxes-licenses','may-12':'office-expense','may-18':'software','may-26':'rent-other','may-29':'fees'}
  for(const [id,category]of Object.entries(expected))expect(s.context.records.find(r=>r.record_id===id)).toMatchObject({treatment:'business',allocations:[{kind:'business',category}]})
  for(const id of ['may-5','may-10','may-13'])expect(s.context.records.find(r=>r.record_id===id)?.treatment).toBe('excluded')
  for(const id of ['may-19','may-31'])expect(s.context.records.find(r=>r.record_id===id)?.bookkeeping_nature).toBe('business_income')
  for(const id of ['may-2','may-4','may-7','may-11','may-14','may-16','may-20','may-22','may-8','may-15','may-28'])expect(s.context.records.find(r=>r.record_id===id)?.treatment).toBe('unresolved')
 })
 it('surfaces every specific fact, one five-purchase exception opportunity, and no bank-fee task',()=>{
  const s=syntheticMayScenario(),before=JSON.stringify(s),built=buildActionIndex(s),actions=built.work.customer.actionable
  expect(actions).toHaveLength(14) // 11 specific questions + loan + refund + one optional sweep
  expect(actions.filter(a=>a.type==='personal_exception_sweep')).toHaveLength(1)
  expect(actions.find(a=>a.type==='personal_exception_sweep')?.items?.map(i=>i.recordId)).toEqual(['may-3','may-6','may-12','may-18','may-26'])
  expect(actions.some(a=>a.recordIds.includes('may-29'))).toBe(false)
  expect(actions.filter(a=>a.type==='mixed_use_sweep'||a.type.startsWith('receipt_'))).toHaveLength(0)
  for(const id of ['may-8','may-9','may-24'])expect(actions.find(a=>a.recordIds.includes(id))?.type).toBe('material_question')
  expect(actions.find(a=>a.recordIds.includes('may-8'))?.question?.kind).toBe('percentage')
  expect(actions.slice(0,13).every(a=>['material_question','special_transaction'].includes(a.type))).toBe(true)
  // The database reader sorts persisted priorities, not the serialized array.
  const persisted=[...built.entries].sort((a,b)=>(b.action.priority.routingTier??0)-(a.action.priority.routingTier??0)||b.action.priority.score-a.action.priority.score||a.action.id.localeCompare(b.action.id))
  expect(persisted.filter(e=>e.action.status==='actionable').map(e=>e.action.id)).toEqual(actions.map(a=>a.id))
  for(const id of ['may-2','may-11'])expect(actions.find(a=>a.recordIds.includes(id))?.question?.confirmation?.optionId).toBe('earned_money')
  expect(JSON.stringify(s)).toBe(before)
 })
 it('does not introduce a universal mixed-use stage after exceptions; only legitimate receipt requests remain',()=>{
  const s=syntheticMayScenario(),first=projectBettiWork(s),sweep=first.customer.actionable.find(a=>a.type==='personal_exception_sweep')!
  const original=JSON.stringify(s.context.records)
  s.context.guidedReviews!.push({business_id:s.businessId,id:'synthetic-review',action:'personal_exception_sweep',disposition:'completed',items:sweep.items!,created_at:now,deferred_until:null})
  const next=projectBettiWork(s)
  expect(next.customer.actionable.some(a=>a.type==='mixed_use_sweep')).toBe(false)
  expect(next.customer.actionable.find(a=>a.type==='receipt_upload_sweep')?.recordIds.sort()).toEqual(sweep.recordIds.sort())
  expect(next.customer.actionable.find(a=>a.recordIds.includes('may-8'))?.question?.kind).toBe('percentage')
  expect(JSON.stringify(s.context.records)).toBe(original)
 })
 it('keeps one account exception review across catch-up/current and prioritizes specifics over a large old batch',()=>{
  const s=syntheticMayScenario(),office=s.context.records.find(r=>r.record_id==='may-12')!
  office.activity_date='2026-09-23'
  for(let i=0;i<90;i++)s.context.records.push({...office,record_id:`older-${i}`,transaction_id:`older-tx-${i}`,activity_date:'2026-01-01'})
  const actions=projectBettiWork(s).customer.actionable,sweeps=actions.filter(a=>a.type==='personal_exception_sweep')
  expect(sweeps).toHaveLength(1)
  expect(sweeps[0].items).toHaveLength(95)
  expect(sweeps[0].affects).toEqual(expect.arrayContaining(['catch_up','current']))
  expect(actions.slice(0,13).every(a=>['material_question','special_transaction'].includes(a.type))).toBe(true)
 })
 it('does not replace a deferred material fact with a generic or receipt request',()=>{
  const s=syntheticMayScenario();s.questions=s.questions.filter(q=>q.recordId!=='may-24')
  s.context.deferred.push({business_id:s.businessId,id:'defer',issue_id:'q-may-24',record_id:'may-24',created_at:now,deferred_until:'2026-10-01T00:00:00Z'})
  const p=projectBettiWork(s)
  expect(p.customer.actionable.some(a=>a.recordIds.includes('may-24'))).toBe(false)
  expect(p.customer.deferred.some(a=>a.recordIds.includes('may-24'))).toBe(true)
 })
 it('defers an optional exception review without withholding any supported working amounts',()=>{
  const s=syntheticMayScenario(),sweep=projectBettiWork(s).customer.actionable.find(a=>a.type==='personal_exception_sweep')!
  s.context.guidedReviews!.push({business_id:s.businessId,id:'deferred-sweep',action:'personal_exception_sweep',disposition:'deferred',items:sweep.items!,created_at:now,deferred_until:'2026-10-01T00:00:00Z'})
  const work=projectBettiWork(s)
  expect(work.customer.actionable.some(a=>a.type==='personal_exception_sweep')).toBe(false)
  expect(work.customer.deferred.some(a=>a.type==='personal_exception_sweep')).toBe(true)
  const report=buildCanonicalReport({canonicalRecords:s.records,legacyRecords:[],periodStart:'2026-01-01',periodEnd:'2026-09-23',currency:'USD'})
  expect(report).toMatchObject({businessIncomeCents:210052,businessExpensesCents:142573,businessProfitCents:67479})
 })
 it('does not label established bookkeeping unfinished solely for an optional review or receipt request',()=>{
  const s=syntheticMayScenario();s.context.records=s.context.records.filter(r=>r.record_id==='may-3');s.questions=[]
  s.context.coverage[0].period_start='2026-01-01';s.context.coverage[0].period_end='2026-09-23'
  let work=projectBettiWork(s)
  expect(work.readiness.catchUp).toBe('available_activity_organized')
  expect(work.readiness.knownAccountsOrganizedThrough).toBe('2026-09-23')
  expect(work.readiness.doneForNow).toBe(false) // Optional correction opportunity remains visible.
  const sweep=work.customer.actionable[0]
  s.context.guidedReviews!.push({business_id:s.businessId,id:'confirmed',action:'personal_exception_sweep',disposition:'completed',items:sweep.items!,created_at:now,deferred_until:null})
  work=projectBettiWork(s)
  expect(work.nextAction?.type).toBe('receipt_upload_sweep')
  expect(work.readiness.catchUp).toBe('available_activity_organized')
  expect(work.readiness.knownAccountsOrganizedThrough).toBe('2026-09-23')
  expect(work.readiness.booksCurrentThrough).toBeNull() // No invented all-source completion.
 })
 it('does not generalize the bank-fee exception without established category, business use, and validated statement evidence',()=>{
  const s=syntheticMayScenario(),r=s.context.records.find(r=>r.record_id==='may-29')!
  expect(statementEstablishesBankFee(r,s.context)).toBe(true)
  expect(guidedStage(r,s.context)).toBeNull()
  for(const changed of [{...r,merchant:'STRIPE PROCESSING FEE'},{...r,treatment:'unresolved'},{...r,allocations:[]}])expect(statementEstablishesBankFee(changed,s.context)).toBe(false)
  expect(statementEstablishesBankFee(r,{...s.context,coverage:[]})).toBe(false)
  expect(statementEstablishesBankFee(r,{...s.context,coverage:s.context.coverage.map(p=>({...p,account_id:'other'}))})).toBe(false)
 })
 it('keeps genuine mixed-account use decisions and stale snapshot protection',()=>{
  const s=syntheticMayScenario(),r=s.context.records.find(r=>r.record_id==='may-3')!
  r.treatment='unresolved';r.allocations=[];s.context.accounts[0].designation='business_and_personal'
  expect(guidedStage(r,s.context)).toBe('mixed_use_sweep')
  expect(guidedStage(r,s.context,true)).toBeNull()
  const before=projectBettiWork(s).customer.actionable.find(a=>a.recordIds.includes(r.record_id))!
  r.review_version='new-evidence'
  expect(projectBettiWork(s).customer.actionable.find(a=>a.recordIds.includes(r.record_id))?.version).not.toBe(before.version)
 })
})
