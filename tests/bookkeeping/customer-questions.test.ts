import { describe, expect, it } from 'vitest'
import type { CanonicalWeeklyReviewItem, WeeklyReviewReason } from '../../app/lib/bookkeeping/model'
import {
  customerQuestionHeadline,
  parsePositiveDollarCents,
  projectCustomerQuestion,
} from '../../app/lib/bookkeeping/customer-questions'

function item(reason: WeeklyReviewReason, context: Record<string, unknown> = {}): CanonicalWeeklyReviewItem {
  return {
    record: { id: 'record-1', businessId: 'business-1', authoritativeAmountCents: -18600, authoritativeCurrency: 'USD' },
    decision: {
      id: 'decision-1', businessId: 'business-1', bookkeepingRecordId: 'record-1',
      supersedesDecisionId: null, bookkeepingNature: 'expense', treatment: 'unresolved',
      reviewStatus: 'needs_review', provenance: 'automation', confidence: 0.5,
      reason: 'A factual answer is needed.', businessPurpose: null, allocations: [],
      actorUserId: null, createdAt: '2026-08-18T00:00:00.000Z',
    },
    event: {
      id: `event-${reason}`, businessId: 'business-1', bookkeepingRecordId: 'record-1',
      reviewIssueId: `issue-${reason}`, supersedesEventId: null, sequenceNumber: 1,
      eventType: 'opened', reason, basedOnDecisionId: 'decision-1', issueKey: reason,
      contextFingerprint: 'context-1', evidenceFingerprint: 'evidence-1',
      questionContext: { schemaVersion: 1, reason, ...context }, answerPayload: null,
      resultingDecisionId: null, deferredUntil: null, provenance: 'automation',
      actorUserId: null, createdAt: '2026-08-18T00:00:00.000Z',
    },
  }
}

function withNature(
  value: CanonicalWeeklyReviewItem,
  bookkeepingNature: CanonicalWeeklyReviewItem['decision']['bookkeepingNature']
) {
  return { ...value, decision: { ...value.decision, bookkeepingNature } }
}

function withDecision(
  value: CanonicalWeeklyReviewItem,
  decision: Partial<CanonicalWeeklyReviewItem['decision']>
) {
  return { ...value, decision: { ...value.decision, ...decision } }
}

const transaction = { merchant: 'Office Depot', amountCents: -18600, currency: 'USD', date: '2026-08-17' }

describe('customer question projection', () => {
  it('asks the meal relationship only when trusted meal context requires it',()=>{
    const meal=withDecision(item('BUSINESS_PURPOSE_NEEDED'),{bookkeepingNature:'expense',treatment:'business',
      businessPurpose:'Discussed a listing',allocations:[{kind:'business',amountCents:-5000,taxCategoryKey:'meals'}]})
    meal.event.questionContext={schemaVersion:1,reason:'BUSINESS_PURPOSE_NEEDED',factType:'meal_attendee_relationship'}
    expect(projectCustomerQuestion(meal,transaction)).toMatchObject({kind:'meal_relationship',prompt:'Who was the meal with?'})
    meal.event.questionContext={schemaVersion:1,reason:'BUSINESS_PURPOSE_NEEDED'}
    expect(projectCustomerQuestion(meal,transaction)).toMatchObject({kind:'business_purpose'})
  })
  it('uses a simple actionable count on Home', () => {
    expect(customerQuestionHeadline(1)).toBe('1 quick question for you')
    expect(customerQuestionHeadline(5)).toBe('5 quick questions for you')
  })

  it('parses customer dollars into exact cents without rounding', () => {
    expect(parsePositiveDollarCents('66')).toBe(6600)
    expect(parsePositiveDollarCents('66.5')).toBe(6650)
    expect(parsePositiveDollarCents('66.05')).toBe(6605)
    expect(parsePositiveDollarCents('66.005')).toBeNull()
    expect(parsePositiveDollarCents('-66')).toBeNull()
    expect(parsePositiveDollarCents('0')).toBeNull()
  })

  it('projects the canonical queue in its existing continuous order', () => {
    const queue = [
      projectCustomerQuestion(item('BUSINESS_USE_UNCLEAR'), transaction),
      projectCustomerQuestion(withDecision(item('BUSINESS_PURPOSE_NEEDED'), {
        treatment: 'business', allocations: [{ kind: 'business', amountCents: -18600 }],
      }), transaction),
      projectCustomerQuestion(withDecision(item('MIXED_USE_CLARIFICATION', { businessUse: 'mixed' }), {
        treatment: 'unresolved', allocations: [],
      }), transaction),
    ]
    expect(queue.map((question) => question?.kind)).toEqual([
      'business_use', 'business_purpose', 'mixed_use',
    ])
    expect(queue.map((question) => question?.prompt)).toEqual([
      'Was this purchase for your business?',
      'What was this purchase for?',
      'Was any of this purchase personal?',
    ])
  })

  it('turns an internal conflict into trusted factual choices only', () => {
    const question = projectCustomerQuestion(item('CONFLICTING_EVIDENCE', {
      options: [
        { optionId: 'bank', factualMeaning: 'The bank amount is correct.' },
        { optionId: 'receipt', factualMeaning: 'The receipt amount is correct.' },
      ],
    }), transaction)
    expect(question).toMatchObject({
      kind: 'factual_choice',
      prompt: 'What actually happened with this transaction?',
      options: [
        { id: 'bank', label: 'The bank amount is correct.' },
        { id: 'receipt', label: 'The receipt amount is correct.' },
      ],
    })
    expect(JSON.stringify(question)).not.toMatch(/conflicting evidence|confidence|category/i)
  })

  it('does not expose conflict fallback options that require a separate explanation', () => {
    expect(projectCustomerQuestion(item('CONFLICTING_EVIDENCE', {
      options: [
        { optionId: 'bank', factualMeaning: 'The bank amount is correct.' },
        { optionId: 'none_of_these', factualMeaning: 'None of these.' },
      ],
    }), transaction)).toBeNull()
  })

  it('projects transaction nature as real-world activity choices without internal terminology', () => {
    const typeQuestion=projectCustomerQuestion(item('TRANSACTION_TYPE_UNCLEAR'), transaction)
    expect(typeQuestion?.kind).toBe('transaction_type')
    expect(typeQuestion?.options?.map(option=>option.label)).toEqual([
      'A purchase','Money I earned','Money moved between accounts','A credit card payment',
      'A refund','Money I added','Money I borrowed',
    ])
    expect(JSON.stringify(typeQuestion)).not.toMatch(/ledger|schedule c|tax category|classification/i)
    expect(projectCustomerQuestion(item('CONFLICTING_EVIDENCE', {
      options: [
        { optionId: 'one', factualMeaning: 'Choose a bookkeeping classification.' },
        { optionId: 'two', factualMeaning: 'Approve the tax category.' },
      ],
    }), transaction)).toBeNull()
  })

  it('keeps purchase-specific questions out unless nature is expense, except a canonical mixed issue', () => {
    for (const reason of [
      'BUSINESS_USE_UNCLEAR', 'BUSINESS_PURPOSE_NEEDED',
    ] as const) {
      expect(projectCustomerQuestion(withNature(item(reason), null), transaction)).toBeNull()
      expect(projectCustomerQuestion(withNature(item(reason), 'transfer'), transaction)).toBeNull()
    }
    expect(projectCustomerQuestion(withNature(item('MIXED_USE_CLARIFICATION',{businessUse:'mixed'}),null),transaction))
      .toMatchObject({kind:'mixed_use'})
    expect(projectCustomerQuestion(withNature(item('MIXED_USE_CLARIFICATION',{businessUse:'mixed'}),'expense'),transaction))
      .toMatchObject({kind:'mixed_use'})
  })

  it('fails closed for malformed fixture or stale question contracts', () => {
    expect(projectCustomerQuestion(item('BUSINESS_PURPOSE_NEEDED'), transaction)).toBeNull()
    expect(projectCustomerQuestion(item('MIXED_USE_CLARIFICATION'), transaction)).toBeNull()
    const malformed = item('BUSINESS_USE_UNCLEAR')
    malformed.event.questionContext = { merchant: 'Office Depot' }
    expect(projectCustomerQuestion(malformed, transaction)).toBeNull()
  })
})
