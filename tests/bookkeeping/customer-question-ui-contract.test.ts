import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const flow = readFileSync('app/questions/QuestionFlow.tsx', 'utf8')
const weekly = readFileSync('app/weekly-review/[id]/page.tsx', 'utf8')
const actions = readFileSync('app/lib/bookkeeping/customer-question-actions.ts', 'utf8')

describe('customer question UI contract', () => {
  it('offers the locked factual actions and completion state', () => {
    for (const copy of [
      'Yes, business', 'No, personal', 'Not sure', 'Come back to this later',
      'No, all business', 'Yes, partly personal', 'How much of the',
      'Business amount', 'Enter the business dollars. I’ll handle the split.',
      'What did you buy?', 'I have the receipt, but I can’t tell what this was for.',
      'You’re all caught up.', 'Back to Home',
    ]) expect(flow).toContain(copy)
    expect(flow).not.toContain('Personal amount')
    expect(flow).not.toContain('About how much was personal?')
    expect(flow).not.toMatch(/Schedule C|confidence score|weekly review|select category/i)
    expect(flow).not.toContain('Finish later')
  })

  it('routes legacy period links to the period-free continuous check-in', () => {
    expect(weekly).toContain("redirect('/check-in')")
    expect(weekly).not.toContain('periodStart')
    expect(flow).toContain("fetch('/api/bookkeeping/questions',{cache:'no-store',signal:AbortSignal.timeout(15_000)})")
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
