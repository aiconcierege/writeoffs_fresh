import { describe, expect, it } from 'vitest'
import { validateTransactionUseCorrection } from '../../app/lib/bookkeeping/transaction-corrections'

describe('transaction factual correction contract', () => {
  it('accepts only Business, Personal, or Both with a positive personal amount', () => {
    expect(validateTransactionUseCorrection({ schemaVersion: 1, use: 'business' }))
      .toEqual({ schemaVersion: 1, use: 'business' })
    expect(validateTransactionUseCorrection({ schemaVersion: 1, use: 'personal' }))
      .toEqual({ schemaVersion: 1, use: 'personal' })
    expect(validateTransactionUseCorrection({ schemaVersion: 1, use: 'mixed', personalAmountCents: 1250 }))
      .toEqual({ schemaVersion: 1, use: 'mixed', personalAmountCents: 1250 })
  })
  it.each([{ schemaVersion: 1, use: 'business', category: 'meals' },
    { schemaVersion: 1, use: 'mixed', personalAmountCents: -1 },
    { schemaVersion: 1, use: 'mixed', percentage: 50 },
    { schemaVersion: 1, use: 'personal', approval: true }])('rejects bookkeeping or malformed input %#', (answer) => {
    expect(() => validateTransactionUseCorrection(answer)).toThrow()
  })
})
