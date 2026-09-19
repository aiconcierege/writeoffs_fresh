import { describe, expect, it } from 'vitest'
import { classifyOperatingExpense } from '../../app/lib/bookkeeping/operating-expense-classification'
import type { BookkeepingEvaluationSnapshot } from '../../app/lib/bookkeeping/deterministic-evaluator'

function snapshot(description: string, extra: Partial<BookkeepingEvaluationSnapshot> = {}): BookkeepingEvaluationSnapshot {
  return { evaluatorVersion: 'v1', businessId: 'business', recordId: 'record', sourceKind: 'financial_transaction',
    amountCents: -10_000, currency: 'USD', occurredOn: '2026-09-08', merchantName: description,
    description, businessDescription: 'Consulting', activeDocumentCount: 0, customerAnswerCount: 0,
    hasOpenConflictingEvidence: false, decisionHistoryLength: 1, movement: null, movementCandidates: [],
    currentDecision: { id: 'decision', businessId: 'business', bookkeepingRecordId: 'record',
      actorUserId: null, supersedesDecisionId: null, createdAt: '2026-09-08T00:00:00Z',
      bookkeepingNature: 'expense', treatment: 'business',
      reviewStatus: 'resolved', provenance: 'system', confidence: 0.99, reason: 'Business account.',
      businessPurpose: null, allocations: [{ kind: 'business', amountCents: -10_000 }] }, ...extra }
}

describe('Schedule C operating-expense classification', () => {
  it.each(['Freelance design services for a customer project.', 'Payment to a freelancer for design work.'])('uses the already supplied purpose: %s', purpose => {
    const value=snapshot('ZELLE TO A PERSON')
    value.currentDecision.businessPurpose=purpose
    expect(classifyOperatingExpense(value)).toMatchObject({status:'ordinary',categoryKey:'contract-labor'})
  })
  const ordinary = [
    ['Google Ads advertising', 'advertising'], ['Broker commission', 'commissions'],
    ['Upwork contractor', 'contract-labor'], ['Professional liability insurance', 'insurance'],
    ['Business loan interest charge', 'interest'], ['Smith law firm attorney', 'legal-professional'],
    ['Staples office supplies', 'office-expense'], ['Regus office rent', 'rent-other'],
    ['HVAC repair service', 'repairs'], ['Business supplies', 'supplies'],
    ['Professional license fee', 'taxes-licenses'], ['Hilton hotel lodging', 'travel'],
    ['Capital Grille restaurant', 'meals'], ['Electric utility', 'utilities'],
    ['Adobe software subscription', 'software'], ['USPS postage', 'postage'],
    ['Bank service fee', 'fees'],
  ] as const
  it.each(ordinary)('classifies %s as %s', (description, categoryKey) => {
    expect(classifyOperatingExpense(snapshot(description))).toMatchObject({ status: 'ordinary', categoryKey })
  })

  it.each([
    ['Laptop computer equipment', 'POSSIBLE_ASSET'], ['Inventory for resale', 'INVENTORY_OR_COGS'],
    ['Gusto payroll', 'PAYROLL_RELATED'],
    ['IRS estimated tax payment', 'GOVERNMENT_PAYMENT_REVIEW'], ['Parking fine', 'NONORDINARY_OR_NONDEDUCTIBLE_REVIEW'],
    ['Multi-year prepaid software', 'POSSIBLE_PREPAYMENT'],
  ])('contains %s instead of forcing an ordinary category', (description, reasonCode) => {
    expect(classifyOperatingExpense(snapshot(description))).toMatchObject({
      status: reasonCode === 'INVENTORY_OR_COGS' ? 'unsupported' : 'special_treatment', categoryKey: null, reasonCode })
  })

  it('recognizes explicit vehicle costs but contains a vehicle purchase',()=>{
    expect(classifyOperatingExpense(snapshot('Shell gasoline'))).toMatchObject({status:'ordinary',categoryKey:'car-truck'})
    expect(classifyOperatingExpense(snapshot('Vehicle purchase'))).toMatchObject({status:'special_treatment',reasonCode:'VEHICLE_PURCHASE_CPA_REVIEW'})
  })

  it('fails closed for weak or conflicting evidence', () => {
    expect(classifyOperatingExpense(snapshot('ACME PURCHASE'))).toMatchObject({ status: 'needs_facts', categoryKey: null })
    expect(classifyOperatingExpense(snapshot('Adobe software for advertising')))
      .toMatchObject({ status: 'needs_facts', reasonCode: 'CONFLICTING_CATEGORY_EVIDENCE' })
    expect(classifyOperatingExpense(snapshot('Staples', { hasOpenConflictingEvidence: true })).taxFacts)
      .toMatchObject({ conflictingEvidence: true })
  })

  it('uses linked meal evidence and keeps meal substantiation separate', () => {
    expect(classifyOperatingExpense(snapshot('THE CAPITAL GRILLE', { receiptMealSupported: true })))
      .toMatchObject({ status: 'ordinary', categoryKey: 'meals', taxFacts: { mealBusinessContext: false } })
  })
})


describe('purchase correction authority', () => {
  it('uses a specific customer correction instead of stale merchant evidence', () => {
    const value = snapshot('Laptop equipment')
    value.currentDecision.provenance = 'user'
    value.currentDecision.businessPurpose = 'Computer repair service for my business'
    expect(classifyOperatingExpense(value)).toMatchObject({ status: 'ordinary', categoryKey: 'repairs' })
    value.currentDecision.businessPurpose = 'For my business'
    expect(classifyOperatingExpense(value).reasonCode).toBe('POSSIBLE_ASSET')
  })
  it('does not impose a price threshold or mistake equipment rent for a purchase', () => {
    expect(classifyOperatingExpense(snapshot('Laptop computer', { amountCents: -5000 })).reasonCode).toBe('POSSIBLE_ASSET')
    expect(classifyOperatingExpense(snapshot('Equipment rental')).categoryKey).toBe('rent-other')
  })
})
