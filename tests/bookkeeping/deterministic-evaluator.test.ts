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
  it('adds a reporting category without changing established business economics', () => {
    const currentDecision = { ...snapshot().currentDecision, bookkeepingNature: 'expense' as const,
      treatment: 'business' as const, reviewStatus: 'resolved' as const, provenance: 'system' as const,
      allocations: [{ kind: 'business' as const, amountCents: -10_000 }] }
    expect(evaluateDeterministicBookkeeping(snapshot({ merchantName: 'Adobe software subscription',
      description: 'Adobe monthly software', movement: null, movementCandidates: [], currentDecision })))
      .toMatchObject({ ruleKey: 'bookkeeping.schedule_c.operating_expense.v1', proposal: {
        bookkeepingNature: 'expense', treatment: 'business', reviewStatus: 'resolved',
        allocations: [{ kind: 'business', amountCents: -10_000, taxCategoryKey: 'software' }],
      } })
  })

  it('fills only the blank category while preserving the customer allocation', () => {
    const currentDecision = { ...snapshot().currentDecision, bookkeepingNature: 'expense' as const,
      treatment: 'mixed_use' as const, reviewStatus: 'resolved' as const, provenance: 'user' as const,
      actorUserId: crypto.randomUUID(), allocations: [
        { kind: 'business' as const, amountCents: -6_000 }, { kind: 'personal' as const, amountCents: -4_000 }] }
    expect(evaluateDeterministicBookkeeping(snapshot({ merchantName: 'Adobe software subscription',
      movement: null, movementCandidates: [], currentDecision }))).toMatchObject({proposal:{allocations:[
        {kind:'business',amountCents:-6000,taxCategoryKey:'software'},{kind:'personal',amountCents:-4000,taxCategoryKey:null}]}})
  })

  it('does not silently replace a current category when evidence conflicts', () => {
    const currentDecision = { ...snapshot().currentDecision, bookkeepingNature: 'expense' as const,
      treatment: 'business' as const, reviewStatus: 'resolved' as const, provenance: 'system' as const,
      allocations: [{ kind: 'business' as const, amountCents: -10_000, taxCategoryKey: 'advertising' }] }
    expect(evaluateDeterministicBookkeeping(snapshot({ merchantName: 'Canva Pro software subscription',
      movement: null, movementCandidates: [], currentDecision })))
      .toBeNull()
  })

  it('does not force contained special domains into an ordinary category', () => {
    const currentDecision = { ...snapshot().currentDecision, bookkeepingNature: 'expense' as const,
      treatment: 'business' as const, reviewStatus: 'resolved' as const, provenance: 'system' as const,
      allocations: [{ kind: 'business' as const, amountCents: -10_000 }] }
    for (const merchantName of ['Dell laptop computer', 'Gusto payroll', 'IRS estimated tax']) {
      expect(evaluateDeterministicBookkeeping(snapshot({ merchantName, movement: null,
        movementCandidates: [], currentDecision }))).toBeNull()
    }
    expect(evaluateDeterministicBookkeeping(snapshot({merchantName:'Shell gasoline',movement:null,movementCandidates:[],currentDecision})))
      .toMatchObject({ruleKey:'bookkeeping.schedule_c.operating_expense.v1',proposal:{allocations:[{taxCategoryKey:'car-truck'}]}})
  })

  it('establishes telecom purchase context without inventing business use', () => {
    for (const input of [
      { merchantName: 'T-MOBILE AUTOPAY', description: 'T-MOBILE AUTOPAY' },
      { merchantName: 'T-Mobile', description: 'AUTOPAY', personalFinanceCategory: {
        primary: 'GENERAL_SERVICES', detailed: 'GENERAL_SERVICES_TELECOMMUNICATION_SERVICES',
      } },
    ]) {
      const result = evaluateDeterministicBookkeeping(snapshot({
        ...input, movement: null, movementCandidates: [],
      }))
      expect(result).toMatchObject({
        ruleKey: 'bookkeeping.economic_context.telecom_service.v1',
        proposal: { bookkeepingNature: 'expense', treatment: 'unresolved', allocations: [] },
      })
    }
  })

  it('establishes Plaid restaurant context but not business use', () => {
    expect(evaluateDeterministicBookkeeping(snapshot({
      merchantName: 'Neighborhood Bistro', movement: null, movementCandidates: [],
      personalFinanceCategory: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_RESTAURANT' },
    }))).toMatchObject({
      ruleKey: 'bookkeeping.economic_context.restaurant_meal.v1',
      proposal: { bookkeepingNature: 'expense', treatment: 'unresolved' },
    })
  })

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
    ['weak restaurant name', { merchantName: 'Food purchase', movementCandidates: [] }],
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
