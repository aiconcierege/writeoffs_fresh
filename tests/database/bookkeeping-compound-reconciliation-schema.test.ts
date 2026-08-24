import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260824000100_add_compound_economic_reconciliations.sql',
  'utf8',
).toLowerCase()

describe('compound economic reconciliation schema', () => {
  it('is additive, append-only, tenant scoped, and exact-cent guarded', () => {
    expect(migration).toContain('create table public.bookkeeping_compound_reconciliations')
    expect(migration).toContain('create table public.bookkeeping_compound_reconciliation_links')
    expect(migration).toContain('create table public.bookkeeping_compound_reconciliation_events')
    expect(migration).toContain('foreign key (anchor_financial_transaction_id, business_id)')
    expect(migration).toContain('foreign key (bookkeeping_record_id, business_id)')
    expect(migration).toContain('linked_amount_cents bigint not null')
    expect(migration).toContain('compound components must reconcile exactly to source signed cents')
    expect(migration).toContain('for update')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('history is append-only')
    expect(migration).toContain('enable row level security')
    expect(migration).not.toMatch(/delete from|update public\.financial_transactions/)
  })

  it('supports only the four bounded scenarios and trusted loan evidence', () => {
    for (const scenario of [
      'processor_settlement', 'loan_payment_split', 'batched_deposit', 'later_bank_match',
    ]) expect(migration).toContain(`'${scenario}'`)
    expect(migration).toContain("loan split requires trusted evidence or customer facts")
    expect(migration).toContain("'loan_principal_payment'")
    expect(migration).not.toContain('create table public.financial_events')
  })

  it('keeps ordinary source associations intact and adds current projections', () => {
    expect(migration).not.toContain('drop index bookkeeping_financial_sources')
    expect(migration).toContain('current_bookkeeping_compound_reconciliations')
    expect(migration).toContain('current_bookkeeping_compound_components')
    expect(migration).toContain('anchor is historical; target a current component')
  })
})
