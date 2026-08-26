import { describe, expect, it } from 'vitest'
import { selectPotentialWriteoffs } from '../../app/lib/bookkeeping/potential-writeoffs'
import type { CanonicalSummaryRecord } from '../../app/lib/bookkeeping/financial-summary'

function record(overrides: Partial<CanonicalSummaryRecord> = {}): CanonicalSummaryRecord {
  return { id: 'record', occurredOn: '2026-08-26', amountCents: -10000,
    currency: 'USD', financialSourceAssociationId: 'source', financialTransactionId: 'tx',
    decisions: [{ id: 'decision', supersedesDecisionId: null, bookkeepingNature: 'expense',
      treatment: 'business', allocations: [{ id: 'allocation', kind: 'business', amountCents: -10000 }] }],
    ...overrides }
}

describe('approved potential-writeoff selector', () => {
  const select = (records: CanonicalSummaryRecord[]) => selectPotentialWriteoffs({
    records, periodStart: '2026-01-01', periodEnd: '2026-12-31',
  })

  it('counts established business and mixed-use expenses once', () => {
    const mixed = record({ id: 'mixed', decisions: [{ id: 'mixed-decision', supersedesDecisionId: null,
      bookkeepingNature: 'expense', treatment: 'mixed_use', allocations: [
        { id: 'business', kind: 'business', amountCents: -6000 },
        { id: 'personal', kind: 'personal', amountCents: -4000 },
      ] }] })
    expect(select([record(), mixed])).toEqual([
      { recordId: 'record', decisionId: 'decision', businessAmountCents: 10000 },
      { recordId: 'mixed', decisionId: 'mixed-decision', businessAmountCents: 6000 },
    ])
  })

  it('excludes unresolved, personal, excluded, income, and standalone credits', () => {
    const variants = [
      record({ id: 'unresolved', decisions: [{ id: 'u', supersedesDecisionId: null,
        bookkeepingNature: 'expense', treatment: 'unresolved', allocations: [] }] }),
      record({ id: 'personal', decisions: [{ id: 'p', supersedesDecisionId: null,
        bookkeepingNature: 'expense', treatment: 'personal', allocations: [{ id: 'pa', kind: 'personal', amountCents: -10000 }] }] }),
      record({ id: 'income', decisions: [{ id: 'i', supersedesDecisionId: null,
        bookkeepingNature: 'business_income', treatment: 'business', allocations: [{ id: 'ia', kind: 'business', amountCents: 10000 }] }] }),
      record({ id: 'credit', amountCents: 1000, decisions: [{ id: 'c', supersedesDecisionId: null,
        bookkeepingNature: 'expense', treatment: 'business', allocations: [{ id: 'ca', kind: 'business', amountCents: 1000 }] }] }),
    ]
    expect(select(variants)).toEqual([])
  })

  it('uses only the current decision so corrections add or remove the record', () => {
    const prior = record().decisions[0]
    const corrected = record({ decisions: [prior, { id: 'personal-now', supersedesDecisionId: prior.id,
      bookkeepingNature: 'expense', treatment: 'personal', allocations: [{ id: 'p', kind: 'personal', amountCents: -10000 }] }] })
    expect(select([corrected])).toEqual([])
  })

  it('includes a receipt-only canonical expense and respects year boundaries', () => {
    expect(select([record({ sourceKind: 'receipt', financialSourceAssociationId: null,
      financialTransactionId: null })])).toHaveLength(1)
    expect(select([record({ occurredOn: '2025-12-31' })])).toHaveLength(0)
  })
})
