import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(process.cwd(),
  'supabase/migrations/20260821000200_add_receipt_understanding_shadow.sql'), 'utf8')

describe('receipt understanding shadow schema', () => {
  it('defines tenant-scoped operational jobs and append-only write-disabled audits', () => {
    expect(sql).toContain('create table public.receipt_processing_jobs')
    expect(sql).toContain('references public.receipts(id,business_id)')
    expect(sql).toContain('create table public.receipt_understanding_evaluations')
    expect(sql).toContain('receipt_understanding_write_disabled_check check (write_enabled=false)')
    expect(sql).toContain('receipt_understanding_evaluations_append_only')
  })
  it('enqueues registration durably and claims with leases and skip-locked concurrency', () => {
    expect(sql).toContain('bookkeeping_receipt_events_enqueue_understanding')
    expect(sql).toContain("new.event_type='uploaded'")
    expect(sql).toContain('for update skip locked')
    expect(sql).toContain('attempt_count<6')
    expect(sql).toContain("state='dead_letter'")
  })
  it('denies customer queue/audit mutation and limits trusted RPC execution', () => {
    expect(sql).toContain('revoke all on public.receipt_processing_jobs from public,anon,authenticated')
    expect(sql).toContain('revoke all on public.receipt_understanding_evaluations from public,anon,authenticated')
    expect(sql).toContain('trusted receipt worker required')
  })
})
