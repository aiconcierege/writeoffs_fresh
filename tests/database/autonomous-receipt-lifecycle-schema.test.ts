import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/20260821000100_add_autonomous_receipt_lifecycle.sql', 'utf8')

describe('autonomous receipt lifecycle schema', () => {
  it('adds truthful retained and extraction-quality provenance without rewriting history', () => {
    expect(migration).toContain("event_type in ('uploaded', 'extraction_completed', 'matched', 'unmatched',")
    expect(migration).toContain("event_type = 'retained' and provenance = 'automation'")
    expect(migration).toContain("event_type = 'uploaded' and provenance = 'user'")
    expect(migration).toContain('quality_status')
    expect(migration).toContain("quality_status in ('usable', 'incomplete', 'suspect')")
    expect(migration).not.toMatch(/update public\.bookkeeping_receipt_events|delete from public\.bookkeeping_receipt/i)
  })

  it('catches bounded suspect facts without a high-dollar ceiling', () => {
    expect(migration).toContain('TOTAL_RESEMBLES_DATE')
    expect(migration).toContain('GENERIC_MERCHANT')
    expect(migration).toContain('DATE_IN_FUTURE')
    expect(migration).not.toMatch(/MAX_RECEIPT|maximum receipt|10000000/)
  })

  it('finalizes usable receipts idempotently without a fake Keep event', () => {
    expect(migration).toContain('finalize_autonomous_bookkeeping_receipt')
    expect(migration).toContain("'retained',")
    expect(migration).toContain("'automation',")
    expect(migration).toContain("concat('receipt:',p_receipt_id)")
    expect(migration).toContain('ensure_initial_bookkeeping_decision')
    expect(migration).not.toMatch(/'kept'.*'automation'/)
  })

  it('uses strict provider-neutral matching and ambiguity fails closed', () => {
    expect(migration).toContain('bookkeeping_autonomous_receipt_match_candidates')
    expect(migration).toContain('financial_transaction.amount_cents = -extraction.total_amount_cents')
    expect(migration).toContain('financial_transaction.transaction_date = extraction.occurred_on')
    expect(migration).toContain('financial_count = 1')
    expect(migration).toContain('receipt_count = 1')
    expect(migration).toContain('AMBIGUOUS_FINANCIAL_MATCH')
    expect(migration).not.toMatch(/similarity\(|levenshtein|interval '[^']*day/i)
  })

  it('extends legacy convergence and supports guarded append-only removal', () => {
    expect(migration).toContain("receipt_event.event_type = 'kept'")
    expect(migration).toContain("receipt_event.event_type = 'retained'")
    expect(migration).toContain('discard_autonomous_bookkeeping_receipt')
    expect(migration).toContain('reverse_bookkeeping_record_convergence')
    expect(migration).toContain('guarded correction is required')
  })
})
