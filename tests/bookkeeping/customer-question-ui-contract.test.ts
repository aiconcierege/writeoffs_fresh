import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const flow = readFileSync('app/questions/QuestionFlow.tsx', 'utf8')
const home = readFileSync('app/home/page.tsx', 'utf8')
const actions = readFileSync('app/lib/bookkeeping/customer-question-actions.ts', 'utf8')

describe('customer question UI contract', () => {
  it('offers the locked factual actions and completion state', () => {
    for (const copy of [
      'Yes, business', 'No, personal', 'Not sure', 'Do this later',
      'No, all business', 'Yes, partly personal', 'How much of the',
      'Business amount', 'Enter the business dollars. I’ll handle the allocation.',
      'You’re all caught up.', 'Back to Home',
    ]) expect(flow).toContain(copy)
    expect(flow).not.toContain('Personal amount')
    expect(flow).not.toContain('About how much was personal?')
    expect(flow).not.toMatch(/Schedule C|confidence score|weekly review|select category/i)
  })

  it('shows the canonical actionable count on Home', () => {
    expect(home).toContain('listCustomerQuestions')
    expect(home).toContain('<QuestionInvitation count={questions.length} compact/>')
    expect(readFileSync('app/home/QuestionInvitation.tsx','utf8')).toContain('Yes, let’s do it')
  })

  it('submits button answers immediately and keeps defer distinct from Not sure', () => {
    expect(flow).toContain("submit({ action: 'not_sure' })")
    expect(flow).toContain("submit({ action: 'defer' })")
    expect(flow).toContain("submit({ action: 'business_use', use: 'business' })")
    expect(flow).toContain("submit({ action: 'business_use', use: 'personal' })")
    expect(flow).toContain("action: 'mixed_business_amount', businessAmountCents: enteredCents")
    expect(flow).not.toContain("action: 'mixed_personal_amount'")
    expect(actions).toContain("input.command.action === 'mixed_business_amount'")
    expect(actions).toContain('return answerMixedUseReviewIssue')
    expect(flow).toContain("deferredInThisSession.current.add(question.id)")
    expect(flow).toContain("!deferredInThisSession.current.has(candidate.id)")
  })

  it('fails closed instead of asking for a percentage in embedded weekly review', () => {
    expect(flow).toContain("question.kind === 'percentage' && embedded")
    expect(flow).toContain('I still need a little more information about this item.')
    expect(flow).toContain('Keep this on my list and continue')
    expect(flow).toContain('keepUnresolvedAndContinue')
    expect(flow).toContain("question.kind === 'percentage' && !embedded")
    expect(flow).toContain("!(embedded && question.kind === 'percentage')")
  })
})
