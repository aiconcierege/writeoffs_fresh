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

const transaction = { merchant: 'Office Depot', amountCents: -18600, currency: 'USD', date: '2026-08-17' }

describe('customer question projection', () => {
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
      projectCustomerQuestion(item('BUSINESS_PURPOSE_NEEDED'), transaction),
      projectCustomerQuestion(item('MIXED_USE_CLARIFICATION'), transaction),
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

  it('does not leak unsupported internal questions into the customer queue', () => {
    expect(projectCustomerQuestion(item('TRANSACTION_TYPE_UNCLEAR'), transaction)).toBeNull()
    expect(projectCustomerQuestion(item('CONFLICTING_EVIDENCE', {
      options: [
        { optionId: 'one', factualMeaning: 'Choose a bookkeeping classification.' },
        { optionId: 'two', factualMeaning: 'Approve the tax category.' },
      ],
    }), transaction)).toBeNull()
  })

  it('keeps purchase-specific questions out of the queue unless nature is expense', () => {
    for (const reason of [
      'BUSINESS_USE_UNCLEAR', 'BUSINESS_PURPOSE_NEEDED', 'MIXED_USE_CLARIFICATION',
    ] as const) {
      expect(projectCustomerQuestion(withNature(item(reason), null), transaction)).toBeNull()
      expect(projectCustomerQuestion(withNature(item(reason), 'transfer'), transaction)).toBeNull()
    }
  })
})
