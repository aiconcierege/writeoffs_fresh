import{readFileSync}from'node:fs'
import{describe,expect,it}from'vitest'
import{resolveV3WeeklyReviewStage,type WeeklyReviewTransaction}from'../../app/lib/bookkeeping/weekly-review'
import{isWeeklyMixedUseCandidate}from'../../app/lib/bookkeeping/weekly-review-mixed-eligibility'

const weekly=readFileSync('app/home/WeeklyReview.tsx','utf8')
const questions=readFileSync('app/questions/QuestionFlow.tsx','utf8')
const loader=readFileSync('app/lib/bookkeeping/weekly-review.ts','utf8')
const worker=readFileSync('app/lib/bookkeeping/weekly-review-processing.ts','utf8')
const summary=readFileSync('app/lib/bookkeeping/financial-summary.ts','utf8')
const transactions=readFileSync('app/lib/bookkeeping/transaction-read-model.ts','utf8')
const workflowRoute=readFileSync('app/api/bookkeeping/reviews/[id]/workflow/route.ts','utf8')

describe('Betti-led Weekly Review v3',()=>{
 const candidate=(overrides:Partial<WeeklyReviewTransaction>={}):WeeklyReviewTransaction=>({
  id:'transaction',recordId:'record',currentDecisionId:'decision',date:'2026-09-01',merchant:'T-MOBILE AUTOPAY',
  amountCents:-14_235,categoryLabel:null,treatment:'unresolved',bookkeepingNature:null,hasReceipt:false,
  receiptLost:false,documentationPendingAcknowledged:false,activeIssueReasons:[],...overrides,
 })
 it('offers unresolved and established expense-direction activity without competing issues',()=>{
  expect(isWeeklyMixedUseCandidate(candidate())).toBe(true)
  expect(isWeeklyMixedUseCandidate(candidate({merchant:'COX COMMUNICATIONS',amountCents:-9_680}))).toBe(true)
  expect(isWeeklyMixedUseCandidate(candidate({treatment:'business',bookkeepingNature:'expense'}))).toBe(true)
 })
 it('excludes personal, income, structural movements, and competing material issues',()=>{
  expect(isWeeklyMixedUseCandidate(candidate({treatment:'personal'}))).toBe(false)
  expect(isWeeklyMixedUseCandidate(candidate({treatment:'excluded'}))).toBe(false)
  expect(isWeeklyMixedUseCandidate(candidate({amountCents:250_000,treatment:'business',bookkeepingNature:'business_income'}))).toBe(false)
  expect(isWeeklyMixedUseCandidate(candidate({treatment:'excluded',bookkeepingNature:'transfer'}))).toBe(false)
  expect(isWeeklyMixedUseCandidate(candidate({activeIssueReasons:['TRANSACTION_TYPE_UNCLEAR']}))).toBe(false)
  expect(isWeeklyMixedUseCandidate(candidate({bookkeepingNature:'expense',activeIssueReasons:['BUSINESS_USE_UNCLEAR']}))).toBe(false)
 })
 it('keeps one visible Activity stage while sequencing personal and mixed substeps',()=>{
  expect(weekly).toContain('Are any of these a mix of business and personal?')
  expect(weekly).toContain('Continue with selected')
  expect(weekly).toContain('None of these were mixed')
  expect(weekly).toContain('mixedFollowups')
  expect(loader).toContain("{personal:'mixed',mixed:'documentation',documentation:'questions',questions:'final'")
 })
 it('gives a current mixed clarification priority over a prematurely completed mixed stage',()=>{
  expect(resolveV3WeeklyReviewStage({workflowLeaf:{stage:'mixed',event_type:'stage_completed'},
    hasCurrentMixedClarification:true})).toBe('mixed')
  expect(resolveV3WeeklyReviewStage({workflowLeaf:{stage:'documentation',event_type:'stage_completed'},
    hasCurrentMixedClarification:true})).toBe('mixed')
  expect(resolveV3WeeklyReviewStage({workflowLeaf:{stage:'mixed',event_type:'stage_completed'},
    hasCurrentMixedClarification:false})).toBe('documentation')
 })
 it('uses authoritative mixed issue leaves rather than display projection to complete Activity',()=>{
  const mixedCompletion=workflowRoute.slice(workflowRoute.indexOf("if(stage==='mixed'&&flowVersion===3)"),
    workflowRoute.indexOf('for(let index=0',workflowRoute.indexOf("if(stage==='mixed'&&flowVersion===3)")))
  expect(mixedCompletion).toContain('listCurrentPeriodMixedClarifications')
  expect(mixedCompletion).not.toContain('listCustomerQuestions')
  expect(mixedCompletion).toContain('still needs its business portion')
 })
 it('collects explicit business dollars or business percentage',()=>{
  expect(questions).toContain('Business dollars')
  expect(questions).toContain('Business percentage')
  expect(questions).toContain("action:'mixed_business_percentage'")
  expect(questions).toContain("action: 'mixed_business_amount'")
 })
 it('blocks v3 presentation for material questions and excludes uncertain dollars',()=>{
  expect(worker).toContain("questions.material>0")
  expect(summary).toContain('record.materiallyUnresolved')
 })
 it('does not expose a normal final-review defer action',()=>{
  const final=weekly.slice(weekly.indexOf('function FinalReview'),weekly.indexOf('function LegacyFinalReviewUnused'))
  expect(final).toContain('Looks right to me')
  expect(final).not.toContain("action('deferred')")
 })
 it('treats open documentation as a disclosed limitation rather than a progression gate',()=>{
  expect(weekly).toContain("documentationDecision:'continue_with_open'")
  expect(weekly).toContain("stage==='documentation'?'Keep going'")
  expect(weekly).not.toContain("stage==='documentation'&&missing.length>0")
 })
 it('derives customer treatment text instead of rendering raw decision provenance',()=>{
  expect(transactions).toContain('customerDecisionExplanation(current)')
  expect(transactions).toContain("return'Business + personal'")
  expect(transactions).not.toContain("decisionReason: current ? text(current, 'reason')")
 })
})
