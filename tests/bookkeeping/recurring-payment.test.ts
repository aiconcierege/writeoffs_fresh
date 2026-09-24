import {describe,it,expect} from 'vitest'
import {BOOKKEEPING_EVALUATOR_VERSION,type BookkeepingEvaluationSnapshot} from '../../app/lib/bookkeeping/deterministic-evaluator'
import {buildSharedEvidence} from '../../app/lib/bookkeeping/shared-evidence'
import {applicableRememberedPayment,type RememberedPayment} from '../../app/lib/bookkeeping/recurring-payment'
function fixture(description='STRIPE PAYOUT',amount=73544):BookkeepingEvaluationSnapshot {
 const s:BookkeepingEvaluationSnapshot={evaluatorVersion:BOOKKEEPING_EVALUATOR_VERSION,businessId:'tenant-a',recordId:'record',sourceKind:'financial_transaction',amountCents:amount,currency:'USD',occurredOn:'2026-05-19',merchantName:description,description,businessDescription:null,activeDocumentCount:0,customerAnswerCount:0,hasOpenConflictingEvidence:false,decisionHistoryLength:1,
  currentDecision:{id:'decision',businessId:'tenant-a',bookkeepingRecordId:'record',supersedesDecisionId:null,bookkeepingNature:null,treatment:'unresolved',reviewStatus:'needs_review',provenance:'system',actorUserId:null,confidence:null,reason:null,businessPurpose:null,allocations:[],createdAt:'2026-05-19T00:00:00Z'},
  movement:{financialTransactionId:'source',financialAccountId:'account',accountType:'checking',amountCents:amount,currency:'USD',occurredOn:'2026-05-19',sourceCurrent:true,pending:false,structuralHint:null,currentDecisionNature:null,currentDecisionTreatment:'unresolved',currentDecisionProvenance:'system'},movementCandidates:[],
  accountUse:{eventId:'account-fact',designation:'business_only',effectiveAt:'2026-09-18T00:00:00Z'},financialOrigin:{kind:'statement',transactionId:'source',evidenceId:'statement-period',confidence:null}}
 s.evidence=buildSharedEvidence(s,[]);return s
}

const fact:RememberedPayment={id:'fact',business_id:'tenant-a',account_id:'account',counterparty:'STRIPE',currency:'USD',effective_on:'2026-05-01',status:'active'}
describe('customer-confirmed recurring payment compatibility',()=>{
 it('uses a scoped customer fact for a materially consistent later payout',()=>expect(applicableRememberedPayment(fixture(),[fact])).toEqual(fact))
 it.each(['other tenant','other account','other currency','revoked','before effective','conflicting evidence','pending','different narrative','invoice','customer correction','ambiguous rules'])('does not reuse for %s',reason=>{
  const snapshot=fixture(),facts=[{...fact}]
  if(reason==='other tenant')facts[0].business_id='foreign'
  if(reason==='other account')facts[0].account_id='other'
  if(reason==='other currency')facts[0].currency='CAD'
  if(reason==='revoked')facts[0].status='revoked'
  if(reason==='before effective')facts[0].effective_on='2027-01-01'
  if(reason==='conflicting evidence')snapshot.hasOpenConflictingEvidence=true
  if(reason==='pending')snapshot.movement!.pending=true
  if(reason==='different narrative')snapshot.description='STRIPE LOAN PAYOUT'
  if(reason==='invoice')snapshot.description='ZELLE FROM STRIPE INV 1041'
  if(reason==='customer correction')snapshot.currentDecision.provenance='user'
  if(reason==='ambiguous rules')facts.push({...fact,id:'second'})
  expect(applicableRememberedPayment(snapshot,facts)).toBeNull()
 })
 it('preserves source and decision data during rule selection',()=>{const s=fixture(),before=JSON.stringify(s);applicableRememberedPayment(s,[fact]);expect(JSON.stringify(s)).toBe(before)})
})
