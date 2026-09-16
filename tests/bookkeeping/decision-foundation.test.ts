import { describe, expect, it } from 'vitest'
import { classifyOperatingExpense } from '../../app/lib/bookkeeping/operating-expense-classification'
import { evaluateDeterministicBookkeeping, type BookkeepingEvaluationSnapshot } from '../../app/lib/bookkeeping/deterministic-evaluator'
import { operatingExpenseFingerprint } from '../../app/lib/bookkeeping/operating-expense-processing'
import { isCategoryOnlyEnrichment } from '../../app/lib/bookkeeping/category-enrichment'
import { decisionProgress } from '../../app/lib/bookkeeping/decision-progress'
import { workingBusinessAllocations } from '../../app/lib/bookkeeping/working-books-policy'
import { readFileSync } from 'node:fs'

function snapshot(description = 'Software subscription'): BookkeepingEvaluationSnapshot {
  return { evaluatorVersion:'v1',businessId:'a',recordId:'r',sourceKind:'financial_transaction',amountCents:-2299,
    currency:'USD',occurredOn:'2026-05-03',merchantName:description,description,businessDescription:null,
    activeDocumentCount:0,customerAnswerCount:0,hasOpenConflictingEvidence:false,decisionHistoryLength:1,
    movement:null,movementCandidates:[],currentDecision:{id:'d',businessId:'a',bookkeepingRecordId:'r',
      actorUserId:null,supersedesDecisionId:null,createdAt:'2026-05-03T00:00:00Z',bookkeepingNature:'expense',
      treatment:'unresolved',reviewStatus:'needs_review',provenance:'system',confidence:null,reason:null,
      businessPurpose:null,allocations:[]}}
}

describe('independent decision dimensions', () => {
  it.each(['Software subscription','Cloud software','Adobe Creative Cloud'])('recognizes %s before business use without allocating money', description => {
    const value=snapshot(description)
    expect(classifyOperatingExpense(value).categoryKey).toBe('software')
    expect(workingBusinessAllocations(value.currentDecision)).toEqual([])
    expect(value.currentDecision.allocations).toEqual([])
  })
  it('account evidence establishes business use without pretending a receipt exists', () => {
    const value=snapshot();value.accountUse={eventId:'use',designation:'business_only',effectiveAt:'2026-01-01'}
    const result=evaluateDeterministicBookkeeping(value)!
    expect(result.proposal).toMatchObject({treatment:'business',allocations:[{amountCents:-2299,kind:'business'}]})
    expect(value.activeDocumentCount).toBe(0)
  })
  it.each(['Office Depot refund','Software reimbursement','Customer deposit'])('does not categorize incoming %s as a purchase', description => {
    const value=snapshot(description);value.amountCents=3210
    expect(classifyOperatingExpense(value).status).not.toBe('ordinary')
    expect(evaluateDeterministicBookkeeping(value)?.proposal).toMatchObject({bookkeepingNature:null,treatment:'unresolved',allocations:[]})
  })
  it.each(['Equipment loan payment','ACH payment - business credit card 3333','TRANSFER TO SAVINGS'])('contains %s before asset/purchase inference', description => {
    const value=snapshot(description)
    expect(classifyOperatingExpense(value).reasonCode).toBe('PAYMENT_OR_TRANSFER_REQUIRES_CONTEXT')
    expect(evaluateDeterministicBookkeeping(value)).toBeNull()
  })
  it('uses provider vocabulary consistently for a meal without inventing its purpose', () => {
    const value=snapshot('Unfamiliar restaurant name')
    value.personalFinanceCategory={primary:'FOOD_AND_DRINK',detailed:'FOOD_AND_DRINK_FAST_FOOD'}
    expect(classifyOperatingExpense(value)).toMatchObject({categoryKey:'meals',taxFacts:{mealBusinessContext:false}})
  })
  it('normalizes provider plurals', () => {
    const value=snapshot('Carrier');value.personalFinanceCategory={primary:'TRAVEL',detailed:'TRAVEL_FLIGHTS'}
    expect(classifyOperatingExpense(value).categoryKey).toBe('travel')
  })
  it('preserves an established category when a weaker vocabulary matcher misses', () => {
    const value=snapshot('Unfamiliar merchant');value.currentDecision.treatment='business'
    value.currentDecision.allocations=[{kind:'business',amountCents:-2299,taxCategoryKey:'meals'}]
    expect(classifyOperatingExpense(value).categoryKey).toBe('meals')
  })
  it('enriches a customer business-use fact without changing it', () => {
    const value=snapshot();value.currentDecision.provenance='user';value.currentDecision.treatment='business'
    value.currentDecision.allocations=[{kind:'business',amountCents:-2299}]
    const proposal=evaluateDeterministicBookkeeping(value)!.proposal
    expect(isCategoryOnlyEnrichment(value.currentDecision,proposal)).toBe(true)
    expect(isCategoryOnlyEnrichment(value.currentDecision,{...proposal,businessPurpose:'Invented'})).toBe(false)
    expect(isCategoryOnlyEnrichment(value.currentDecision,{...proposal,allocations:[{kind:'business',amountCents:-2200,taxCategoryKey:'software'}]})).toBe(false)
  })
  it('does not flatten a multi-category or partly categorized split', () => {
    const value=snapshot();value.currentDecision.treatment='business'
    value.currentDecision.allocations=[{kind:'business',amountCents:-1000,taxCategoryKey:'supplies'},
      {kind:'business',amountCents:-1299,taxCategoryKey:'office-expense'}]
    expect(evaluateDeterministicBookkeeping(value)).toBeNull()
  })
  it('keeps an ambiguous useful answer eligible for clarification rather than inventing a category', () => {
    const value=snapshot('Unfamiliar store');value.currentDecision.provenance='user'
    value.currentDecision.businessPurpose='I bought paper from a store called Fun.'
    expect(classifyOperatingExpense(value).status).toBe('needs_facts')
    value.currentDecision.businessPurpose='Printer paper for office work'
    expect(classifyOperatingExpense(value).categoryKey).toBe('office-expense')
  })
  it('retains a factual purchase correction after unrelated automated enrichment',()=>{
    const value=snapshot('Software merchant');value.customerFactsAuthoritative=true
    value.currentDecision.businessPurpose='Printer paper for office work'
    value.currentDecision.treatment='business'
    value.currentDecision.allocations=[{kind:'business',amountCents:-2299,taxCategoryKey:'office-expense'}]
    expect(classifyOperatingExpense(value)).toMatchObject({categoryKey:'office-expense',status:'ordinary'})
  })
  it('does not claim provider evidence for a statement-only candidate',()=>{
    const result=classifyOperatingExpense(snapshot())
    expect(result.evidence).not.toContain('plaid')
  })
  it('fingerprints all nested material facts and ignores object key order', () => {
    expect(operatingExpenseFingerprint({version:2,facts:{meal:true,portion:80}}))
      .not.toBe(operatingExpenseFingerprint({version:2,facts:{meal:true,portion:50}}))
    expect(operatingExpenseFingerprint({version:2,facts:{meal:true,portion:80}}))
      .toBe(operatingExpenseFingerprint({facts:{portion:80,meal:true},version:2}))
  })
  it('provides a recovery path for unresolved activity without inventing a question', () => {
    for(const description of ['Equipment loan payment','Unknown purchase','Card payment']) {
      const state=decisionProgress({recordId:'r',treatment:'unresolved',nature:null,category:null,
        hasReceipt:false,receiptUnavailable:false,needsFact:false,amountCents:-45000,description})
      expect(state.state).toBe('system_pending');expect(state.action?.href).toBe('/import')
    }
  })
  it('keeps a material percentage question actionable while preserving its category candidate',()=>{
    expect(decisionProgress({recordId:'phone',treatment:'unresolved',nature:'expense',category:null,
      candidate:'utilities',hasReceipt:false,receiptUnavailable:false,needsFact:true,amountCents:-14628,description:'Phone service'}))
      .toMatchObject({state:'unresolved',action:{href:'/check-in?record=phone'}})
  })
  it('projects documentation separately from organized working books', () => {
    expect(decisionProgress({recordId:'r',treatment:'business',nature:'expense',category:'software',
      hasReceipt:false,receiptUnavailable:true,needsFact:false,amountCents:-2299,description:'Software'}))
      .toMatchObject({state:'documentation',action:null})
  })
  it('read projection does not invoke question creation RPCs', () => {
    const source=readFileSync('app/lib/bookkeeping/customer-questions.ts','utf8')
    expect(source).not.toContain("rpc('ensure_current_")
  })
})
