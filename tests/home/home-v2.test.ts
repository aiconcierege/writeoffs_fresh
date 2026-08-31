import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'

const home=readFileSync('app/home/page.tsx','utf8')
const header=readFileSync('app/components/Header.tsx','utf8')
const questions=readFileSync('app/home/QuestionInvitation.tsx','utf8')
const weekly=readFileSync('app/home/WeeklyReview.tsx','utf8')

describe('bookkeeper-centered Home',()=>{
 it('uses only the approved canonical potential-writeoff selector',()=>{
  expect(home).toContain('getAuthenticatedPotentialWriteoffs')
  expect(home).toContain('potential.count')
  expect(home).toContain("potential {potential.count === 1 ? 'writeoff' : 'writeoffs'}")
  expect(home).not.toContain(".from('transactions')")
 })
 it('invites factual questions without manufacturing urgency or approval',()=>{
  expect(home).toContain('<QuestionInvitation count={questions.length} compact/>')
  expect(questions).toContain('Not right now')
  expect(questions).toContain('writeoffs-question-prompt-after')
 expect(questions).not.toContain('confirmed')
  expect(home).toContain("questions.length > 8 ? 'I have a few things I need your help with.'")
  expect(home).toContain('There are {questions.length} questions in your continuous question queue.')
 })
 it('presents one period-level review with correction and confirmation choices',()=>{
  expect(home).toContain('review={weeklyReview} currentQuestions={currentReviewQuestions}')
  expect(weekly).toContain('Everything looks right')
  expect(weekly).toContain('Make a change')
  expect(weekly).toContain("action('confirmed')")
  expect(weekly).toContain('home-review-category')
  expect(weekly).toContain('formatReviewActivityDate')
 })
 it('keeps financial figures secondary and membership scoped',()=>{
  expect(home.indexOf('potential.count')).toBeLessThan(home.indexOf('<FinancialRelationship'))
  expect(home).toContain('business={isBusiness}')
 expect(home).toContain('income={summary.businessIncomeCents}')
 expect(home).toContain('getHomeOperatingStatus')
 expect(home).toContain('<HomeOperatingStatus status={operatingStatus}/>')
 })
 it('makes Home a record hub and uses one global menu',()=>{
  for(const label of ['Transactions','Receipts','Mileage','Reports'])expect(home).toContain(label)
  expect(header).toContain('Menu')
  expect(header).toContain('aria-label="Authenticated navigation"')
  for(const group of ['Your books','Betti','Your account'])expect(header).toContain(group)
  expect(header).not.toContain('aria-label="Primary"')
 })
 it('keeps Betti work in the hero without a greeting or duplicate work card',()=>{
  expect(home).toContain('className="home-betti-work"')
  expect(home).toContain('potential writeoffs found')
  expect(home).toContain('receipts staying with expenses')
  expect(home).toContain('still need a fact from you')
  expect(home).not.toContain('HomeGreeting')
  expect(home).not.toContain('current_business_review_cadence')
  expect(home).not.toContain('className="home-recent-work"')
 })
})
