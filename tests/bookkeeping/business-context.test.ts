import { describe, expect, it } from 'vitest'
import { assessBusinessContext, businessContextAllocationDomain } from '../../app/lib/bookkeeping/business-context'
import { BOOKKEEPING_EVALUATOR_VERSION, evaluateDeterministicBookkeeping,
  type BookkeepingEvaluationSnapshot } from '../../app/lib/bookkeeping/deterministic-evaluator'

function snapshot(overrides: Partial<BookkeepingEvaluationSnapshot> = {}): BookkeepingEvaluationSnapshot {
  return { evaluatorVersion: BOOKKEEPING_EVALUATOR_VERSION, businessId: 'business', recordId: 'record',
    sourceKind: 'financial_transaction', amountCents: -10_000, currency: 'USD', occurredOn: '2026-09-05',
    merchantName: 'Office Store', description: 'Office supplies', businessDescription: 'Consulting',
    activeDocumentCount: 0, customerAnswerCount: 0, hasOpenConflictingEvidence: false,
    decisionHistoryLength: 1, currentDecision: { id: 'decision', businessId: 'business',
      bookkeepingRecordId: 'record', supersedesDecisionId: null, bookkeepingNature: 'expense',
      treatment: 'unresolved', reviewStatus: 'needs_review', provenance: 'system', actorUserId: null,
      confidence: null, reason: 'Purchase established.', businessPurpose: null, allocations: [],
      createdAt: '2026-09-05T00:00:00Z' }, movement: null, movementCandidates: [],
    accountUse: null, customerProvidedReceipts: [], ...overrides }
}

describe('customer-authored business context', () => {
  it('defaults an ordinary expense from a Business-only account to 100% business', () => {
    const result = evaluateDeterministicBookkeeping(snapshot({ accountUse: { eventId: 'account-use',
      designation: 'business_only', effectiveAt: '2026-09-01T00:00:00Z' } }))
    expect(result).toMatchObject({ ruleKey: 'bookkeeping.business_context.default_business.v1',
      proposal: { treatment: 'business', reviewStatus: 'resolved',
        allocations: [{ kind: 'business', amountCents: -10_000 }] } })
  })

  it('establishes an enriched ordinary purchase before applying account context', () => {
    const unresolved = snapshot({ currentDecision: { ...snapshot().currentDecision,
      bookkeepingNature: null }, personalFinanceCategory: {
        primary: 'GENERAL_MERCHANDISE', detailed: 'GENERAL_MERCHANDISE_OFFICE_SUPPLIES',
      } })
    expect(evaluateDeterministicBookkeeping(unresolved)).toMatchObject({
      ruleKey: 'bookkeeping.economic_context.ordinary_expense.v1',
      proposal: { bookkeepingNature: 'expense', treatment: 'unresolved' },
    })
    expect(evaluateDeterministicBookkeeping({ ...unresolved, accountUse: {
      eventId: 'account-use', designation: 'business_only', effectiveAt: '2026-09-01T00:00:00Z',
    } })).toMatchObject({
      ruleKey: 'bookkeeping.business_context.default_business.v1',
      proposal: { bookkeepingNature: 'expense', treatment: 'business' },
    })
  })

  it('does not treat a mixed-capable account as authority', () => {
    expect(assessBusinessContext(snapshot({ accountUse: { eventId: 'mixed',
      designation: 'business_and_personal', effectiveAt: '2026-09-01T00:00:00Z' } })).state).toBe('unknown')
  })

  it('defaults an ordinary expense with a customer-provided linked receipt', () => {
    expect(evaluateDeterministicBookkeeping(snapshot({ customerProvidedReceipts: [{ receiptId: 'receipt',
      documentLinkId: 'link', uploadEventId: 'upload' }] }))).toMatchObject({
      proposal: { treatment: 'business', allocations: [{ amountCents: -10_000 }] },
    })
  })

  it('does not grant customer authority to an automated or synthetic document', () => {
    const evidence = snapshot({ activeDocumentCount: 1, customerProvidedReceipts: [] })
    expect(assessBusinessContext(evidence).state).toBe('unknown')
    expect(evaluateDeterministicBookkeeping(evidence)).toBeNull()
  })

  it('keeps telecom allocation unresolved even with strong account context', () => {
    const telecom = snapshot({ merchantName: 'T-Mobile', description: 'Phone service',
      accountUse: { eventId: 'account-use', designation: 'business_only',
        effectiveAt: '2026-09-01T00:00:00Z' } })
    expect(businessContextAllocationDomain(telecom)).toBe('telecom')
    expect(evaluateDeterministicBookkeeping(telecom)).toMatchObject({ proposal: {
          treatment: 'unresolved', allocations: [],
        } })
  })

  it('defaults a supported meal to business but leaves substantiation open', () => {
    expect(evaluateDeterministicBookkeeping(snapshot({ merchantName: 'Neighborhood Bistro',
      personalFinanceCategory: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_RESTAURANT' },
      accountUse: { eventId: 'account-use', designation: 'business_only',
        effectiveAt: '2026-09-01T00:00:00Z' } }))).toMatchObject({ proposal: {
        treatment: 'business', reviewStatus: 'needs_review',
        allocations: [{ taxCategoryKey: 'meals' }],
      } })
  })

  it('never overrides an explicit customer correction', () => {
    for (const treatment of ['business', 'personal', 'mixed_use'] as const) {
      const result = evaluateDeterministicBookkeeping(snapshot({ currentDecision: { ...snapshot().currentDecision,
        treatment, provenance: 'user', allocations: treatment === 'mixed_use'
          ? [{ kind: 'business', amountCents: -5_000 }, { kind: 'personal', amountCents: -5_000 }]
          : [{ kind: treatment, amountCents: -10_000 }],
      }, accountUse: { eventId: 'account-use', designation: 'business_only',
        effectiveAt: '2026-09-01T00:00:00Z' }, customerProvidedReceipts: [{ receiptId: 'receipt',
        documentLinkId: 'link', uploadEventId: 'upload' }] }))
      if (treatment === 'personal') expect(result).toBeNull()
      else expect(result?.proposal).toMatchObject({ treatment, allocations: treatment === 'mixed_use'
        ? [{ kind: 'business', amountCents: -5_000, taxCategoryKey: 'office-expense' }, { kind: 'personal', amountCents: -5_000 }]
        : [{ kind: 'business', amountCents: -10_000, taxCategoryKey: 'office-expense' }] })
    }
  })

  it('withdraws only its own inferred treatment when the supporting context disappears', () => {
    const inferred = snapshot({ currentDecision: { ...snapshot().currentDecision,
      treatment: 'business', reviewStatus: 'resolved', provenance: 'automation',
      reason: 'Customer deliberately provided the receipt linked to this expense.',
      allocations: [{ kind: 'business', amountCents: -10_000 }],
    } })
    expect(evaluateDeterministicBookkeeping(inferred)).toMatchObject({
      ruleKey: 'bookkeeping.business_context.withdrawn.v1',
      proposal: { treatment: 'unresolved', allocations: [] },
    })
  })
})
