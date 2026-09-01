import{readFileSync}from'node:fs'
import{describe,expect,it}from'vitest'

const weekly=readFileSync('app/home/WeeklyReview.tsx','utf8')
const questions=readFileSync('app/questions/QuestionFlow.tsx','utf8')
const loader=readFileSync('app/lib/bookkeeping/weekly-review.ts','utf8')
const worker=readFileSync('app/lib/bookkeeping/weekly-review-processing.ts','utf8')
const summary=readFileSync('app/lib/bookkeeping/financial-summary.ts','utf8')
const transactions=readFileSync('app/lib/bookkeeping/transaction-read-model.ts','utf8')

describe('Betti-led Weekly Review v3',()=>{
 it('keeps one visible Activity stage while sequencing personal and mixed substeps',()=>{
  expect(weekly).toContain('Are any of these a mix of business and personal?')
  expect(weekly).toContain('Continue with selected')
  expect(weekly).toContain('None of these were mixed')
  expect(weekly).toContain('mixedFollowups')
  expect(loader).toContain("{personal:'mixed',mixed:'documentation',documentation:'questions',questions:'final'")
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
 it('derives customer treatment text instead of rendering raw decision provenance',()=>{
  expect(transactions).toContain('customerDecisionExplanation(current)')
  expect(transactions).toContain("return'Business + personal'")
  expect(transactions).not.toContain("decisionReason: current ? text(current, 'reason')")
 })
})
