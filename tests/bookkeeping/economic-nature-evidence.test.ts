import {describe,expect,it} from 'vitest'
import {BOOKKEEPING_EVALUATOR_VERSION,evaluateDeterministicBookkeeping,decisionMatchesProposal,type BookkeepingEvaluationSnapshot} from '../../app/lib/bookkeeping/deterministic-evaluator'
import {buildSharedEvidence} from '../../app/lib/bookkeeping/shared-evidence'
import {assessEconomicNature} from '../../app/lib/bookkeeping/economic-nature-evidence'
import {validateAutomatedDecisionProposal} from '../../app/lib/bookkeeping/validation'

function fixture(description='ACH CREDIT - CLIENT PAYMENT',amount=210000):BookkeepingEvaluationSnapshot {
 const s:BookkeepingEvaluationSnapshot={evaluatorVersion:BOOKKEEPING_EVALUATOR_VERSION,businessId:'tenant-a',recordId:'record',sourceKind:'financial_transaction',amountCents:amount,currency:'USD',occurredOn:'2026-05-19',merchantName:description,description,businessDescription:null,activeDocumentCount:0,customerAnswerCount:0,hasOpenConflictingEvidence:false,decisionHistoryLength:1,
  currentDecision:{id:'decision',businessId:'tenant-a',bookkeepingRecordId:'record',supersedesDecisionId:null,bookkeepingNature:null,treatment:'unresolved',reviewStatus:'needs_review',provenance:'system',actorUserId:null,confidence:null,reason:null,businessPurpose:null,allocations:[],createdAt:'2026-05-19T00:00:00Z'},
  movement:{financialTransactionId:'source',financialAccountId:'account',accountType:'checking',amountCents:amount,currency:'USD',occurredOn:'2026-05-19',sourceCurrent:true,pending:false,structuralHint:null,currentDecisionNature:null,currentDecisionTreatment:'unresolved',currentDecisionProvenance:'system'},movementCandidates:[],
  accountUse:{eventId:'account-fact',designation:'business_only',effectiveAt:'2026-09-18T00:00:00Z'},financialOrigin:{kind:'statement',transactionId:'source',evidenceId:'statement-period',confidence:null}}
 s.evidence=buildSharedEvidence(s,[]);return s
}
describe('provenance-aware source economic nature',()=>{
 it('A: explicit client credit + observed financial source + business account produces canonical income',()=>{
  const s=fixture(),result=evaluateDeterministicBookkeeping(s)!;expect(result.proposal).toMatchObject({bookkeepingNature:'business_income',treatment:'business',allocations:[{kind:'business',amountCents:210000}]})
  expect(()=>validateAutomatedDecisionProposal(210000,result.proposal)).not.toThrow()
  expect(result.proposal.reason).toContain(s.evidence!.fingerprint)
  const current={...s.currentDecision,...result.proposal,provenance:'automation' as const}
  expect(decisionMatchesProposal(current,result.proposal)).toBe(true)
  expect(evaluateDeterministicBookkeeping({...s,currentDecision:current})).toBeNull()
 })
 it.each([['TRANSFER FROM SAVINGS 1111',50000],['TRANSFER TO CHECKING 2222',-30000]])('B: complete direction/account narrative resolves non-P&L without claiming a match: %s',(description,amount)=>{
  expect(evaluateDeterministicBookkeeping(fixture(description,amount))?.proposal).toMatchObject({bookkeepingNature:'transfer',treatment:'excluded',allocations:[{kind:'excluded',amountCents:amount}]})
 })
 it.each(['ACH DEPOSIT - BLUE MESA CONSULTING','ACH CREDIT','PAYMENT','STRIPE PAYOUT','ZELLE FROM ROBERT HALL','ACH CREDIT - CLIENT PAYMENT REFUND','NOT A CLIENT PAYMENT','ACH CREDIT - LOAN PAYMENT'])('C: ambiguous/contradictory incoming money stays unresolved: %s',description=>expect(assessEconomicNature(fixture(description))).toBeNull())
 it.each(['TRANSFER','TRANSFER FROM JOHN','TRANSFER FROM SAVINGS','TRANSFER FROM SAVINGS 1111 LOAN','TRANSFER FROM SAVINGS 1111 CLIENT PAYMENT','OWNER TRANSFER FROM SAVINGS 1111'])('D: transfer-like text alone is insufficient: %s',description=>expect(assessEconomicNature(fixture(description))).toBeNull())
 it('E: a checking debit explicitly paying a card balance is excluded without a paired card side',()=>expect(evaluateDeterministicBookkeeping(fixture('ACH PAYMENT - BUSINESS CREDIT CARD 3333',-128437))?.proposal).toMatchObject({bookkeepingNature:'credit_card_payment',treatment:'excluded'}))
 it('F: refund nature does not fabricate the original purchase, income, or reversal allocation',()=>expect(evaluateDeterministicBookkeeping(fixture('REFUND - OFFICE DEPOT',3210))?.proposal).toMatchObject({bookkeepingNature:'refund',treatment:'unresolved',allocations:[]}))
 it('G: loan narrative requests evidence without establishing principal/interest or a deduction',()=>expect(evaluateDeterministicBookkeeping(fixture('LOAN PAYMENT - EQUIPMENT FINANCE CO',-45000))?.proposal).toMatchObject({bookkeepingNature:'loan_principal_payment',treatment:'unresolved',allocations:[]}))
 it.each(['pending','stale','missing-source','wrong-source','customer','conflict','mixed-account','missing-account','direction','provider-conflict','receipt-only'] as const)('fails closed for %s',condition=>{
  const s=fixture()
  if(condition==='pending')s.movement!.pending=true
  if(condition==='stale')s.movement!.sourceCurrent=false
  if(condition==='missing-source')s.evidence=undefined
  if(condition==='wrong-source')s.financialOrigin!.transactionId='foreign-source'
  if(condition==='customer')s.currentDecision.provenance='user'
  if(condition==='conflict')s.hasOpenConflictingEvidence=true
  if(condition==='mixed-account')s.accountUse!.designation='business_and_personal'
  if(condition==='missing-account')s.accountUse=null
  if(condition==='direction'){s.amountCents=-210000;s.movement!.amountCents=-210000}
  if(condition==='provider-conflict')s.personalFinanceCategory={primary:'TRANSFER_IN',detailed:'TRANSFER_IN_CASH_ADVANCES_AND_LOANS'}
  if(condition==='receipt-only')s.sourceKind='receipt'
  expect(assessEconomicNature(s)).toBeNull()
 })
 it('high-confidence provider account-transfer evidence generalizes beyond statement wording',()=>{
  const s=fixture('BANK MOVEMENT');s.financialOrigin={kind:'plaid',transactionId:'source',evidenceId:'provider-source',confidence:'HIGH'};s.personalFinanceCategory={primary:'TRANSFER_IN',detailed:'TRANSFER_IN_ACCOUNT_TRANSFER'};s.evidence=buildSharedEvidence(s,[])
  expect(assessEconomicNature(s)?.nature).toBe('transfer');s.financialOrigin.confidence='LOW';expect(assessEconomicNature(s)).toBeNull()
 })
 it('wrong direction and card purchase-like text do not pass payment rules',()=>{
  expect(assessEconomicNature(fixture('TRANSFER TO SAVINGS 1111',30000))).toBeNull()
  expect(assessEconomicNature(fixture('CREDIT CARD PURCHASE 3333',-1000))).toBeNull()
 })
})
