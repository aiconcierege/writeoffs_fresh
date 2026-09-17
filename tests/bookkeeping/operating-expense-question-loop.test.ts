import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookkeepingEvaluationSnapshot } from '../../app/lib/bookkeeping/deterministic-evaluator'
import { processOperatingExpenseTreatment } from '../../app/lib/bookkeeping/operating-expense-processing'
import { reconcileQuestionSession } from '../../app/questions/question-session'
import type { CustomerQuestion } from '../../app/lib/bookkeeping/customer-questions'

const openReviewIssue = vi.hoisted(() => vi.fn())
vi.mock('../../app/lib/bookkeeping/supabase-repository', () => ({
  SupabaseBookkeepingRepository: class { openReviewIssue = openReviewIssue },
}))
vi.mock('../../app/lib/bookkeeping/tax-treatment-service', () => ({
  evaluateAndAppendProductionTaxTreatment: vi.fn(() => { throw new Error('No deduction should be invented') }),
}))

function snapshot(): BookkeepingEvaluationSnapshot {
  return { evaluatorVersion: 'v1', businessId: 'business-a', recordId: 'receipt-record', sourceKind: 'receipt',
    amountCents: -954, currency: 'USD', occurredOn: '2026-09-08', merchantName: null, description: null,
    businessDescription: null, activeDocumentCount: 1, customerAnswerCount: 2, hasOpenConflictingEvidence: false,
    decisionHistoryLength: 3, movement: null, movementCandidates: [],
    currentDecision: { id: 'before-answer', businessId: 'business-a', bookkeepingRecordId: 'receipt-record',
      actorUserId: 'owner', supersedesDecisionId: 'previous', createdAt: '2026-09-17T00:00:00Z',
      bookkeepingNature: 'expense', treatment: 'business', reviewStatus: 'needs_review', provenance: 'user',
      confidence: null, reason: null, businessPurpose: null,
      allocations: [{ kind: 'business', amountCents: -954, taxCategoryKey: null }] } }
}
function database(supplied = false) {
  const rpc = vi.fn(async () => ({ data: supplied, error: null }))
  const insert = vi.fn(async () => ({ error: null }))
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: null }), insert }
  return { admin: { from: () => query, rpc } as unknown as SupabaseClient, rpc, insert }
}

describe('answered receipt-backed generic question cannot regenerate indefinitely', () => {
  beforeEach(() => vi.clearAllMocks())
  it('advances the queue after the saved answer, including repeated worker reassessment with new decision IDs', async () => {
    const state = snapshot(), db = database()
    await processOperatingExpenseTreatment({ admin: db.admin, snapshot: state })
    expect(openReviewIssue).toHaveBeenCalledTimes(1)
    expect(openReviewIssue).toHaveBeenCalledWith(expect.objectContaining({ questionContext: expect.objectContaining({ factType: 'ordinary_expense_purpose' }) }))
    // The real answer command appends the answer/decision and resolves the old
    // issue. The database fact predicate now recognizes that persisted answer.
    state.currentDecision.businessPurpose = 'food'
    db.rpc.mockResolvedValue({ data: true, error: null })
    for (let pass = 0; pass < 5; pass++) {
      state.currentDecision.id = `after-answer-${pass}`
      const result = await processOperatingExpenseTreatment({ admin: db.admin, snapshot: state })
      expect(result).toMatchObject({ outcome: 'needs_facts', classification: { categoryKey: null } })
    }
    expect(openReviewIssue).toHaveBeenCalledTimes(1)
    expect(state.currentDecision.allocations).toEqual([{ kind: 'business', amountCents: -954, taxCategoryKey: null }])
    const answered = { id: 'answered', version: 'old', recordId: state.recordId } as CustomerQuestion
    const next = { id: 'next', version: 'current', recordId: 'other' } as CustomerQuestion
    expect(reconcileQuestionSession([answered, next], [next], new Set(), state.recordId)).toEqual([next])
  })
  it('does not confuse a business-use answer, a deferral, or an absent purchase-purpose answer with the requested fact', async () => {
    const state = snapshot(), db = database(false)
    state.customerAnswerCount = 8
    await processOperatingExpenseTreatment({ admin: db.admin, snapshot: state })
    expect(openReviewIssue).toHaveBeenCalledTimes(1)
    expect(db.rpc).toHaveBeenCalledWith('bookkeeping_has_current_expense_purpose_answer', {
      p_business_id: 'business-a', p_record_id: 'receipt-record',
    })
  })
  it('fails closed if saved-answer evidence cannot be read', async () => {
    const db = database(); db.rpc.mockRejectedValue(new Error('unavailable'))
    await expect(processOperatingExpenseTreatment({ admin: db.admin, snapshot: snapshot() })).rejects.toThrow('unavailable')
    expect(openReviewIssue).not.toHaveBeenCalled()
  })
  it('keeps a genuinely different travel fact separate', async () => {
    const state = snapshot(), db = database(true)
    state.merchantName = 'Hotel lodging'
    await processOperatingExpenseTreatment({ admin: db.admin, snapshot: state })
    expect(db.rpc).not.toHaveBeenCalled()
    expect(openReviewIssue).toHaveBeenCalledWith(expect.objectContaining({ questionContext: expect.objectContaining({ factType: 'business_travel_details' }) }))
  })
})
