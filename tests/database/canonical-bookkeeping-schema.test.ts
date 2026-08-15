import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260814000300_add_canonical_bookkeeping_foundation.sql'
  ),
  'utf8'
)

describe('canonical bookkeeping database boundary', () => {
  it('keeps source evidence and canonical history append-only', () => {
    expect(migration).toContain('financial_transactions_id_business_unique')
    expect(migration).toContain('bookkeeping_records_reject_update')
    expect(migration).toContain('bookkeeping_financial_sources_protect_history')
    expect(migration).toContain(
      'financial-origin source evidence cannot be revoked'
    )
    expect(migration).toContain(
      'financial source amount requires a reconciled bookkeeping correction'
    )
    expect(migration).toContain(
      'source revocation requires a reconciled bookkeeping correction'
    )
    expect(migration).toContain('bookkeeping_decisions_reject_update')
    expect(migration).toContain('bookkeeping_allocations_reject_update')
    expect(migration).toContain('canonical bookkeeping records are append-only')
  })

  it('carries Business identity through source, decision, and allocation relationships', () => {
    expect(migration).toContain(
      'foreign key (financial_transaction_id, business_id)'
    )
    expect(migration).toContain(
      'foreign key (bookkeeping_record_id, business_id)'
    )
    expect(migration).toContain(
      'foreign key (bookkeeping_decision_id, business_id, bookkeeping_record_id)'
    )
    expect(migration).toContain('receipt does not belong to bookkeeping Business')
  })

  it('enforces idempotent source records and non-branching decision history', () => {
    expect(migration).toContain(
      '(business_id, source_kind, ingestion_key)'
    )
    expect(migration).toContain(
      'bookkeeping_financial_sources_active_transaction_unique_idx'
    )
    expect(migration).toContain('bookkeeping_decisions_one_initial_idx')
    expect(migration).toContain('bookkeeping_decisions_one_successor_idx')
  })

  it('checks allocation reconciliation at the end of the transaction', () => {
    expect(migration).toContain('assert_bookkeeping_decision_reconciles')
    expect(migration).toContain('deferrable initially deferred')
    expect(migration).toContain(
      'bookkeeping allocations must reconcile to record amount'
    )
    expect(migration).toContain(
      'mixed-use treatment requires business and non-business allocations'
    )
  })

  it('provides atomic idempotent record and decision operations', () => {
    expect(migration).toContain('function public.ensure_bookkeeping_record')
    expect(migration).toContain(
      'on conflict (business_id, source_kind, ingestion_key) do nothing'
    )
    expect(migration).toContain('function public.append_bookkeeping_decision')
    expect(migration).toContain(
      'function public.attach_bookkeeping_financial_source'
    )
    expect(migration).toContain(
      'bookkeeping decision changed; reload before correcting'
    )
    expect(migration).not.toMatch(/security\s+definer/i)
  })

  it('enables RLS on every tenant-owned table without delete policies', () => {
    for (const table of [
      'bookkeeping_records',
      'bookkeeping_financial_sources',
      'bookkeeping_decisions',
      'bookkeeping_allocations',
      'bookkeeping_document_links',
    ]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`
      )
      expect(migration).toContain(`${table}_select_own_business`)
      expect(migration).not.toContain(`${table}_delete_own_business`)
    }
    expect(migration).toContain(
      'businesses.owner_user_id = (select auth.uid())'
    )
  })

  it('does not backfill or alter compatibility receipts and transactions', () => {
    expect(migration).not.toMatch(/insert\s+into\s+public\.(transactions|receipts)/i)
    expect(migration).not.toMatch(/update\s+public\.(transactions|receipts)/i)
    expect(migration).not.toMatch(/delete\s+from\s+public\.(transactions|receipts)/i)
    expect(migration).not.toMatch(/alter\s+table\s+public\.(transactions|receipts)/i)
  })
})
