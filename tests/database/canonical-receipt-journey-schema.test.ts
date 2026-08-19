import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260819000400_add_canonical_receipt_journey.sql'), 'utf8')

describe('canonical receipt journey migration', () => {
  it('adds append-only, RLS-protected receipt facts and lifecycle history', () => {
    expect(migration).toContain('create table public.bookkeeping_receipt_extractions')
    expect(migration).toContain('create table public.bookkeeping_receipt_events')
    expect(migration).toContain('canonical receipt history is append-only')
    expect(migration).toContain('alter table public.bookkeeping_receipt_extractions enable row level security')
    expect(migration).toContain('alter table public.bookkeeping_receipt_events enable row level security')
  })

  it('exposes only narrow authenticated receipt operations', () => {
    expect(migration).toContain('register_bookkeeping_receipt')
    expect(migration).toContain('record_bookkeeping_receipt_extraction')
    expect(migration).toContain('keep_unmatched_bookkeeping_receipt')
    expect(migration).toContain('discard_unmatched_bookkeeping_receipt')
    expect(migration).toContain('receipts_protect_canonical_history')
    expect(migration).toContain('revoke insert on public.receipts from authenticated')
    expect(migration).toContain('revoke execute on function public.attach_bookkeeping_receipt_with_documentation(uuid,uuid) from authenticated')
    expect(migration).not.toContain('grant insert on public.bookkeeping_receipt_events')
  })

  it('creates receipt-only records without fake financial sources', () => {
    expect(migration).toContain("'receipt',null,'user'")
    expect(migration).toContain("concat('receipt:',p_receipt_id)")
    expect(migration).not.toContain("insert into public.financial_transactions")
    expect(migration).not.toContain("insert into public.financial_accounts")
    expect(migration).not.toContain("insert into public.transactions")
    expect(migration).not.toContain('transaction_id =')
  })
})
