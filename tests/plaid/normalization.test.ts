import { describe, expect, it } from 'vitest'
import {
  normalizePlaidAccount, normalizePlaidRemoval, normalizePlaidTransaction,
  plaidAmountToCanonicalCents,
} from '../../app/lib/plaid/normalize'

const transaction = {
  transaction_id: 'tx-1', account_id: 'account-1', date: '2025-04-03',
  authorized_date: '2025-04-02', amount: 42.19, name: 'EXAMPLE STORE',
  merchant_name: 'Example Store', pending: false, payment_channel: 'online',
  iso_currency_code: 'USD', personal_finance_category: { primary: 'GENERAL_MERCHANDISE' },
}

describe('Plaid provider normalization', () => {
  it('normalizes Plaid outflows and inflows once into exact canonical cents', () => {
    expect(plaidAmountToCanonicalCents(42.19)).toBe(-4219)
    expect(plaidAmountToCanonicalCents(-1000)).toBe(100000)
    expect(plaidAmountToCanonicalCents(-2.5)).toBe(250)
    expect(() => plaidAmountToCanonicalCents(1.001)).toThrow(/exact cents/)
  })

  it('retains provider enrichment as evidence without creating tax or personal conclusions', () => {
    const result = normalizePlaidTransaction(transaction, 'added')
    expect(result).toMatchObject({
      event_type: 'added', transaction_id: 'tx-1', amount_cents: -4219,
      pending: false, merchant_name: 'Example Store', transaction_date: '2025-04-03',
    })
    expect(result.provider_evidence).toEqual(expect.objectContaining({
      personal_finance_category: { primary: 'GENERAL_MERCHANDISE' },
    }))
    expect(JSON.stringify(result)).not.toMatch(/tax_category|personal.*true|deduct/i)
  })

  it('preserves pending correlation and gives modifications a new immutable fingerprint', () => {
    const pending = normalizePlaidTransaction({ ...transaction, pending: true }, 'added')
    const posted = normalizePlaidTransaction({
      ...transaction, transaction_id: 'tx-posted', pending_transaction_id: 'tx-1',
      pending: false, amount: 42.2,
    }, 'added')
    const modified = normalizePlaidTransaction({ ...transaction, merchant_name: 'Corrected' }, 'modified')
    expect(posted.pending_transaction_id).toBe('tx-1')
    expect(pending.source_hash).not.toBe(posted.source_hash)
    expect(modified.source_hash).not.toBe(normalizePlaidTransaction(transaction, 'added').source_hash)
  })

  it('maps only supported transaction accounts and never stores balances', () => {
    expect(normalizePlaidAccount({
      account_id: 'a', type: 'depository', subtype: 'checking', name: 'Checking',
      official_name: 'Business Checking', mask: '1234', balances: { iso_currency_code: 'USD', current: 900 },
    })).toEqual({ account_id: 'a', display_name: 'Business Checking', account_type: 'checking',
      account_subtype: 'checking', mask: '1234', currency: 'USD' })
    expect(normalizePlaidAccount({ account_id: 'loan', type: 'loan', subtype: 'mortgage', balances: {} })).toBeNull()
  })

  it('represents removal as provider lifecycle history, not a destructive mutation', () => {
    expect(normalizePlaidRemoval({ transaction_id: 'tx-1' })).toMatchObject({
      event_type: 'removed', transaction_id: 'tx-1', amount_cents: null,
    })
  })
})
