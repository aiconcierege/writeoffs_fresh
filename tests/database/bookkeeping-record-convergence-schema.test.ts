import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260820000400_add_receipt_financial_convergence.sql',
), 'utf8')

describe('receipt-first bookkeeping convergence schema', () => {
  it('adds an append-only, Business-scoped alias history without rewriting sources', () => {
    expect(migration).toContain('create table public.bookkeeping_record_convergence_events')
    expect(migration).toContain('foreign key (survivor_record_id, business_id)')
    expect(migration).toContain('foreign key (absorbed_record_id, business_id)')
    expect(migration).toContain("event_type in ('converged', 'reversed')")
    expect(migration).toContain('bookkeeping record convergence history is append-only')
    expect(migration).not.toMatch(/delete from public\.(receipts|financial_transactions|bookkeeping_records)/i)
  })

  it('implements only the exact, unique kept-receipt predicate', () => {
    expect(migration).toContain("receipt_event.event_type = 'kept'")
    expect(migration).toContain("receipt_event.provenance = 'user'")
    expect(migration).toContain('financial_transaction.amount_cents = -receipt_extraction.total_amount_cents')
    expect(migration).toContain('financial_transaction.transaction_date = receipt_extraction.occurred_on')
    expect(migration).toContain('normalize_receipt_convergence_merchant')
    expect(migration).toContain('financial_candidate_count <> 1')
    expect(migration).toContain('receipt_candidate_count <> 1')
    expect(migration).not.toMatch(/similarity\(|levenshtein|date_trunc|interval '[^']*day/i)
  })

  it('fails closed for dependent state and keeps convergence provider-neutral', () => {
    expect(migration).toContain('bookkeeping_allocations')
    expect(migration).toContain('bookkeeping_review_events')
    expect(migration).toContain('bookkeeping_documentation_events')
    expect(migration).toContain("treatment = 'unresolved'")
    expect(migration).toContain("provenance = 'system'")
    expect(migration).not.toMatch(/plaid.*attempt_bookkeeping_receipt_convergence|csv.*attempt_bookkeeping_receipt_convergence/i)
  })

  it('reenqueues the survivor and protects customer reversal', () => {
    expect(migration).toContain("'deterministic_evaluation'")
    expect(migration).toContain('reverse_bookkeeping_record_convergence')
    expect(migration).toContain('guarded correction is required')
    expect(migration).toContain('owner_user_id = (select auth.uid())')
    expect(migration).toContain('revoke execute on function public.attempt_bookkeeping_receipt_convergence')
  })
})
