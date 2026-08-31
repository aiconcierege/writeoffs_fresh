import { describe, expect, it } from 'vitest'
import { deriveRecentlyHandled } from '../../app/lib/home/recently-handled'
import type { TransactionReadRow } from '../../app/lib/bookkeeping/transaction-read-model'

function row(overrides: Partial<TransactionReadRow>): TransactionReadRow {
  return {
    id: 'transaction-1', sourceModel: 'canonical', date: '2026-08-20', vendor: 'Office Depot',
    description: null, amount: -25, amountCents: -2500, currency: 'USD', category_key: null,
    has_receipt: false, receipt_waived: false, treatmentLabel: 'Business', decisionReason: null,
    decisionProvenance: 'system', correctionCount: 0, recordId: 'record-1', currentDecisionId: 'decision-1',
    bookkeepingNature: 'expense', treatment: 'business',
    history: [{ id: 'decision-1', summary: 'Business', explanation: null, createdAt: '2026-08-21T12:00:00.000Z' }],
    evidenceLinks: [], receiptLost: false, sourceLabel: null, sourceKind: 'financial_transaction', contractorName: null,
    ...overrides,
  }
}

describe('recently handled Home evidence', () => {
  it('shows only meaningful completed canonical outcomes', () => {
    const handled = deriveRecentlyHandled([
      row({ id: 'expense' }),
      row({ id: 'income', vendor: 'Square', bookkeepingNature: 'income', amountCents: 9000 }),
      row({ id: 'receipt', vendor: 'Home Depot', evidenceLinks: [{ id: 'link', receiptId: 'receipt', attachedAt: '2026-08-24T12:00:00.000Z' }] }),
      row({ id: 'correction', vendor: 'Chevron', correctionCount: 1 }),
      row({ id: 'unresolved', treatment: 'unresolved' }),
      row({ id: 'personal', treatment: 'personal' }),
      row({ id: 'legacy', sourceModel: 'legacy' }),
    ])
    expect(handled[0]?.outcome).toBe('Receipt matched')
    expect(handled.map(item => item.outcome)).toEqual(expect.arrayContaining([
      'Receipt matched', 'Business expense handled', 'Customer correction applied', 'Income recorded',
    ]))
    expect(handled.some(item => item.id.includes('unresolved'))).toBe(false)
  })

  it('does not pad the list and caps meaningful outcomes at five', () => {
    expect(deriveRecentlyHandled([row({ id: 'only' })])).toHaveLength(1)
    expect(deriveRecentlyHandled(Array.from({ length: 7 }, (_, index) => row({ id: `${index}` })))).toHaveLength(5)
  })
})
