import{describe,expect,it}from'vitest'
import{readFileSync}from'node:fs'
const weekly=readFileSync('app/home/WeeklyReview.tsx','utf8')
const processing=readFileSync('app/lib/bookkeeping/weekly-review-processing.ts','utf8')
const questions=readFileSync('app/questions/page.tsx','utf8')
const workflowRoute=readFileSync('app/api/bookkeeping/reviews/[id]/workflow/route.ts','utf8')

describe('transaction-first weekly review',()=>{
 it('orders exception sweeps before questions and documentation',()=>{
  expect(weekly).toContain("personal:'mixed',mixed:'questions',questions:'documentation',documentation:'mileage',mileage:'final'")
  expect(weekly).toContain('Which of these were personal?')
  expect(weekly).toContain('Did any include business and personal spending?')
  expect(weekly).toContain('businessAmountCents')
 })
 it('shows readable transaction facts and receipt state',()=>{
  expect(weekly).toContain('weekly-transaction-meta')
  expect(weekly).toContain("item.hasReceipt?'Receipt attached':'No receipt'")
  expect(weekly).toContain('ReceiptUploadAction')
 })
 it('keeps questions period-scoped and final presentation gated',()=>{
  expect(questions).toContain('question.transaction.date>=query.start!')
  expect(processing).toContain("stage==='final'")
  expect(processing).toContain('if(!workflowReady||questions>0)')
 })
 it('includes mileage before final review',()=>{
  expect(weekly).toContain('Did you drive for your business this week?')
  expect(weekly).toContain('Add another trip')
 })
 it('advances documentation only through a persisted include/exclude decision',()=>{
  expect(weekly).toContain("advance('include_missing')")
  expect(weekly).toContain("advance('exclude_missing')")
  expect(weekly).toContain("decideOne(item,'include_missing')")
  expect(weekly).toContain("decideOne(item,'exclude_missing')")
  expect(weekly).toContain('setEventId(result.eventId??eventId)')
  expect(weekly).toContain('completeStage:false')
  expect(weekly).toContain("stage==='documentation'&&missing.length>0")
  expect(weekly).toContain("['business','mixed_use'].includes(item.treatment)")
 })
 it('opens canonical missing-documentation requests before entering that stage',()=>{
  expect(workflowRoute).toContain('ensurePeriodDocumentationRequests')
  expect(workflowRoute).toContain("open_bookkeeping_documentation_request")
  expect(workflowRoute).toContain("p_reason:'MISSING_SUPPORTING_DOCUMENTATION'")
 })
})
