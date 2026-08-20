import { describe, expect, it } from 'vitest'
import {
  BOOKKEEPING_EVALUATOR_VERSION,
  evaluateDeterministicBookkeeping,
  type BookkeepingEvaluationSnapshot,
  type MovementEvidence,
} from '../../app/lib/bookkeeping/deterministic-evaluator'

function movement(input: Partial<MovementEvidence> = {}): MovementEvidence {
  return {
    financialTransactionId: crypto.randomUUID(),
    financialAccountId: crypto.randomUUID(),
    accountType: 'checking',
    amountCents: -10_000,
    currency: 'USD',
    occurredOn: '2026-08-20',
    sourceCurrent: true,
    pending: false,
    structuralHint: 'account_transfer',
    currentDecisionNature: null,
    currentDecisionTreatment: 'unresolved',
    currentDecisionProvenance: 'system',
    ...input,
  }
}

function snapshot(input: Partial<BookkeepingEvaluationSnapshot> = {}): BookkeepingEvaluationSnapshot {
  const source = movement()
  return {
    evaluatorVersion: BOOKKEEPING_EVALUATOR_VERSION,
    businessId: crypto.randomUUID(),
    recordId: crypto.randomUUID(),
    sourceKind: 'financial_transaction',
    amountCents: source.amountCents,
    currency: 'USD',
    occurredOn: source.occurredOn,
    merchantName: null,
    description: null,
    businessDescription: 'Independent service business',
    activeDocumentCount: 0,
    customerAnswerCount: 0,
    hasOpenConflictingEvidence: false,
    decisionHistoryLength: 1,
    currentDecision: {
      id: crypto.randomUUID(), businessId: crypto.randomUUID(),
      bookkeepingRecordId: crypto.randomUUID(), supersedesDecisionId: null,
      bookkeepingNature: null, treatment: 'unresolved', reviewStatus: 'needs_review',
      provenance: 'system', actorUserId: null, confidence: null,
      reason: 'Awaiting review.', businessPurpose: null, allocations: [],
      createdAt: '2026-08-20T00:00:00Z',
    },
    movement: source,
    movementCandidates: [movement({
      amountCents: -source.amountCents,
      financialAccountId: crypto.randomUUID(),
    })],
    ...input,
  }
}

describe('deterministic bookkeeping evaluator v1', () => {
  it('resolves one exact structurally supported connected-account transfer', () => {
    const result = evaluateDeterministicBookkeeping(snapshot())
    expect(result?.ruleKey).toBe('bookkeeping.connected_account_transfer.v1')
    expect(result?.proposal).toMatchObject({
      bookkeepingNature: 'transfer', treatment: 'excluded', reviewStatus: 'resolved',
      confidence: 1,
      allocations: [{ kind: 'excluded', amountCents: -10_000 }],
    })
  })

  it('resolves one exact supported bank-to-credit-card payment', () => {
    const source = movement({ structuralHint: 'credit_card_payment', accountType: 'checking' })
    const result = evaluateDeterministicBookkeeping(snapshot({
      amountCents: source.amountCents,
      movement: source,
      movementCandidates: [movement({
        amountCents: -source.amountCents,
        accountType: 'credit_card',
        structuralHint: 'account_transfer',
      })],
    }))
    expect(result?.ruleKey).toBe('bookkeeping.credit_card_payment.v1')
    expect(result?.proposal).toMatchObject({
      bookkeepingNature: 'credit_card_payment', treatment: 'excluded',
      allocations: [{ kind: 'excluded', amountCents: -10_000 }],
    })
  })

  it.each([
    ['merchant only', { movement: movement({ structuralHint: null }), movementCandidates: [] }],
    ['airline', { merchantName: 'United Airlines', movementCandidates: [] }],
    ['restaurant', { merchantName: 'Restaurant', movementCandidates: [] }],
    ['general retailer', { merchantName: 'Amazon', movementCandidates: [] }],
    ['uncorrelated refund description', { merchantName: 'Merchant refund', movementCandidates: [] }],
    ['deposit sign', { amountCents: 50_000, movement: movement({ amountCents: 50_000, structuralHint: null }), movementCandidates: [] }],
    ['ambiguous duplicate pair', { movementCandidates: [
      movement({ amountCents: 10_000 }), movement({ amountCents: 10_000 }),
    ] }],
    ['conflicting evidence', { hasOpenConflictingEvidence: true }],
    ['stale source', { movement: movement({ sourceCurrent: false }) }],
    ['pending source', { movement: movement({ pending: true }) }],
    ['counterpart customer decision', { movementCandidates: [movement({
      amountCents: 10_000, currentDecisionProvenance: 'user',
      currentDecisionNature: 'expense', currentDecisionTreatment: 'business',
    })] }],
    ['receipt only', { sourceKind: 'receipt' as const, movement: null, movementCandidates: [] }],
  ])('fails closed for %s', (_label, override) => {
    expect(evaluateDeterministicBookkeeping(snapshot(override))).toBeNull()
  })

  it('never overwrites explicit customer treatment, including unresolved answers', () => {
    expect(evaluateDeterministicBookkeeping(snapshot({
      currentDecision: {
        ...snapshot().currentDecision,
        provenance: 'user',
      },
    }))).toBeNull()
  })

  it('requires unique opposite cents, currency, date proximity, and distinct accounts', () => {
    const base = snapshot()
    for (const candidate of [
      movement({ amountCents: 9_999 }),
      movement({ amountCents: 10_000, currency: 'EUR' }),
      movement({ amountCents: 10_000, occurredOn: '2026-08-10' }),
      movement({ amountCents: 10_000, financialAccountId: base.movement!.financialAccountId }),
    ]) {
      expect(evaluateDeterministicBookkeeping({ ...base, movementCandidates: [candidate] })).toBeNull()
    }
  })

  it('uses identical rules for equivalent canonical snapshots regardless of source labels', () => {
    const canonical = snapshot()
    const first = evaluateDeterministicBookkeeping({ ...canonical, description: 'Provider source' })
    const second = evaluateDeterministicBookkeeping({ ...canonical, description: 'Imported source' })
    expect(second).toEqual(first)
  })

  it('fails closed for a different evaluator version until explicitly supported', () => {
    expect(evaluateDeterministicBookkeeping({
      ...snapshot(), evaluatorVersion: 'v2' as never,
    })).toBeNull()
  })
})
