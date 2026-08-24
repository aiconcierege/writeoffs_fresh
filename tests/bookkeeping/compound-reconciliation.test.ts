import { describe, expect, it, vi } from 'vitest'
import {
  createCompoundReconciliation,
  reverseCompoundReconciliation,
} from '../../app/lib/bookkeeping/compound-reconciliation'

describe('compound reconciliation application contract', () => {
  it('passes only canonical identities and signed integer components to the trusted RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'reconciliation-id', error: null })
    const result = await createCompoundReconciliation({
      supabase: { rpc } as never,
      businessId: 'business-id', financialTransactionId: 'transaction-id',
      anchorRecordId: 'anchor-id', scenario: 'processor_settlement',
      basisKind: 'customer_fact', requestKey: 'request-id',
      components: [
        { recordId: 'income-id', amountCents: 200_000, role: 'settlement_income' },
        { recordId: 'fee-id', amountCents: -4_000, role: 'settlement_fee' },
      ],
    })
    expect(result).toBe('reconciliation-id')
    expect(rpc).toHaveBeenCalledWith('create_bookkeeping_compound_reconciliation', {
      p_business_id: 'business-id', p_anchor_financial_transaction_id: 'transaction-id',
      p_anchor_bookkeeping_record_id: 'anchor-id', p_scenario: 'processor_settlement',
      p_basis_kind: 'customer_fact', p_basis_reference_ids: [], p_request_key: 'request-id',
      p_components: [
        { recordId: 'income-id', amountCents: 200_000, role: 'settlement_income' },
        { recordId: 'fee-id', amountCents: -4_000, role: 'settlement_fee' },
      ],
    })
  })

  it('rejects unsafe cents before calling the database', async () => {
    const rpc = vi.fn()
    await expect(createCompoundReconciliation({
      supabase: { rpc } as never,
      businessId: 'business-id', financialTransactionId: 'transaction-id',
      anchorRecordId: 'anchor-id', scenario: 'later_bank_match',
      basisKind: 'customer_fact', requestKey: 'request-id',
      components: [{ recordId: 'payment-id', amountCents: 1.5, role: 'payment_match' }],
    })).rejects.toThrow('integer cents')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('uses the guarded append-only reversal RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'reversal-id', error: null })
    await expect(reverseCompoundReconciliation({
      supabase: { rpc } as never,
      reconciliationId: 'reconciliation-id', expectedCurrentEventId: 'event-id',
      requestKey: 'request-id', reason: 'Customer corrected the relationship.',
    })).resolves.toBe('reversal-id')
    expect(rpc).toHaveBeenCalledWith('reverse_bookkeeping_compound_reconciliation', {
      p_reconciliation_id: 'reconciliation-id', p_expected_current_event_id: 'event-id',
      p_request_key: 'request-id', p_reason: 'Customer corrected the relationship.',
    })
  })
})
