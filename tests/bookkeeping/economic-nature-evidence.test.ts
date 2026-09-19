import {purchaseUnderstanding,payoutUnderstanding} from '../../app/lib/bookkeeping/purchase-understanding'
import {classifyOperatingExpense} from '../../app/lib/bookkeeping/operating-expense-classification'
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
 it.each([['REFUND - OFFICE DEPOT',3210],['LOAN PAYMENT - EQUIPMENT FINANCE CO',-45000]] as const)('unresolved special evidence does not create an equivalent decision on retry: %s',(description,amount)=>{
  const s=fixture(description,amount),first=evaluateDeterministicBookkeeping(s)!
  const current={...s.currentDecision,...first.proposal,id:'new-decision',provenance:'automation' as const}
  const next={...s,currentDecision:current};next.evidence=buildSharedEvidence(next,[])
  const repeated=evaluateDeterministicBookkeeping(next)!
  expect(decisionMatchesProposal(current,repeated.proposal)).toBe(true)
  expect(repeated.proposal.allocations).toEqual([])
 })
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


describe('evidence-first working facts',()=>{
 it.each(['INTEREST PAID','BANK INTEREST EARNED','DEPOSIT INTEREST'])('establishes working bank interest from a complete narrative: %s',description=>{
  const s=fixture(description,52),result=evaluateDeterministicBookkeeping(s)!
  expect(result.proposal).toMatchObject({bookkeepingNature:'business_income',treatment:'business',allocations:[{kind:'business',amountCents:52}]})
  expect(()=>validateAutomatedDecisionProposal(52,result.proposal)).not.toThrow()
 })
 it.each(['LOAN INTEREST REFUND','INTEREST PAID REVERSAL','DIVIDEND PAYMENT','CUSTOMER INTEREST PAYMENT'])('does not infer bank interest from %s',description=>expect(assessEconomicNature(fixture(description,52))).toBeNull())
 it('does not mistake interest charged for income or overwrite customer facts',()=>{
  expect(assessEconomicNature(fixture('INTEREST PAID',-52))).toBeNull()
  const s=fixture('INTEREST PAID',52);s.customerFactsAuthoritative=true;expect(assessEconomicNature(s)).toBeNull()
 })
 it.each(['STRIPE PAYOUT','SQUARE PAYOUT','ACME MERCHANT SETTLEMENT','ZELLE FROM JANE MORRIS - INV 1041','ACH FROM ACME STUDIO INVOICE ABC123'])('narrows a settlement hypothesis without booking unsupported revenue: %s',description=>{
  const s=fixture(description,73544);expect(assessEconomicNature(s)).toBeNull()
  expect(payoutUnderstanding(s)).toMatchObject({kind:'customer_payment_candidate',confidence:.8,basis:'inferred',sourceId:'source'})
 })
 it.each(['INSURANCE PAYOUT','LOAN PAYOUT','UNKNOWN ACH CREDIT','STRIPE PAYOUT REFUND','INVOICE 1041','ZELLE TO JANE INV 1041','ZELLE FROM JANE LOAN INV 1041'])('keeps ambiguous or contradictory %s broad',description=>expect(payoutUnderstanding(fixture(description))).toBeNull())
 it.each(['currency','date','provider','pending','source','customer'] as const)('rejects stale/conflicting payout evidence: %s',condition=>{
  const s=fixture('STRIPE PAYOUT')
  if(condition==='currency')s.movement!.currency='CAD'
  if(condition==='date')s.movement!.occurredOn='2026-05-18'
  if(condition==='provider')s.personalFinanceCategory={primary:'TRANSFER_IN',detailed:'TRANSFER_IN_CASH_ADVANCES_AND_LOANS'}
  if(condition==='pending')s.movement!.pending=true
  if(condition==='source')s.financialOrigin!.transactionId='another-tenant-record'
  if(condition==='customer')s.customerFactsAuthoritative=true
  expect(payoutUnderstanding(s)).toBeNull()
 })
 it.each(['STATE FARM INSURANCE','ACME INSURANCE'])('establishes an insurance purchase using account evidence but retains the coverage question: %s',description=>{
  const s=fixture(description,-11875)
  expect(purchaseUnderstanding(s)?.kind).toBe('insurance')
  expect(evaluateDeterministicBookkeeping(s)?.proposal).toMatchObject({bookkeepingNature:'expense',treatment:'business'})
  expect(classifyOperatingExpense(s)).toMatchObject({status:'needs_facts',reasonCode:'INSURANCE_COVERAGE_NEEDED'})
 })
 it('does not infer purchase from an insurer name alone, a credit or transfer',()=>{
  expect(purchaseUnderstanding(fixture('STATE FARM',-11875))).toBeNull()
  expect(purchaseUnderstanding(fixture('INSURANCE REFUND',11875))).toBeNull()
  expect(purchaseUnderstanding(fixture('TRANSFER INSURANCE',-11875))).toBeNull()
 })
})


describe('purchase fact and business-use fact stay independent',()=>{
 it('uses an existing business-only account after the customer confirms only purchase nature',()=>{
  const s=fixture('ZELLE TO CONSULTANT',-17500)
  s.currentDecision={...s.currentDecision,bookkeepingNature:'expense',provenance:'user'}
  s.customerFactsAuthoritative=true;s.customerPurchaseOnly={answerEventId:'purchase-answer',decisionId:s.currentDecision.id}
  expect(evaluateDeterministicBookkeeping(s)?.proposal).toMatchObject({bookkeepingNature:'expense',treatment:'business'})
 })
 it.each(['no-proof','wrong-version','mixed-account','personal-choice','phone','conflict'] as const)('does not override a materially different customer fact: %s',condition=>{
  const s=fixture('UNKNOWN VENDOR',-17500)
  s.currentDecision={...s.currentDecision,bookkeepingNature:'expense',provenance:'user'}
  s.customerFactsAuthoritative=true;s.customerPurchaseOnly={answerEventId:'purchase-answer',decisionId:s.currentDecision.id}
  if(condition==='no-proof')delete s.customerPurchaseOnly
  if(condition==='wrong-version')s.customerPurchaseOnly!.decisionId='older'
  if(condition==='mixed-account')s.accountUse!.designation='business_and_personal'
  if(condition==='personal-choice')s.currentDecision.treatment='personal'
  if(condition==='phone'){s.description='PHONE SERVICE';s.merchantName='PHONE SERVICE'}
  if(condition==='conflict')s.hasOpenConflictingEvidence=true
  expect(evaluateDeterministicBookkeeping(s)).toBeNull()
 })
 it('recognizes a printing-service purchase without inventing whether it was advertising or office supplies',()=>{
  const s=fixture('CHECK 104 - DESERT PRINT SHOP',-21840)
  expect(evaluateDeterministicBookkeeping(s)?.proposal).toMatchObject({bookkeepingNature:'expense',treatment:'business'})
  expect(classifyOperatingExpense(s).status).toBe('needs_facts')
 })
})
