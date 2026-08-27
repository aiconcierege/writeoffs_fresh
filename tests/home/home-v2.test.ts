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
  expect(home).toContain('<WeeklyReview review={weeklyReview}/>')
  expect(weekly).toContain('Everything looks right')
  expect(weekly).toContain('Make a change')
  expect(weekly).toContain("action('confirmed')")
 })
 it('keeps financial figures secondary and membership scoped',()=>{
  expect(home.indexOf('potential.count')).toBeLessThan(home.indexOf('<FinancialRelationship'))
  expect(home).toContain('business={isBusiness}')
 expect(home).toContain('income={summary.businessIncomeCents}')
  expect(readFileSync('app/home/HomeVisuals.tsx','utf8')).toContain('<polyline points={points}')
 })
 it('makes Home a record hub and uses one global menu',()=>{
  for(const label of ['Transactions','Receipts','Mileage','Reports'])expect(home).toContain(label)
  expect(header).toContain('Menu')
  expect(header).toContain('aria-label="Your records"')
  expect(header).not.toContain('aria-label="Primary"')
 })
})
