import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260820000100_add_bookkeeping_processing_queue.sql',
), 'utf8')

describe('bookkeeping processing queue schema', () => {
  it('is provider-neutral operational infrastructure with tenant integrity', () => {
    expect(migration).toContain('create table public.bookkeeping_processing_jobs')
    expect(migration).toContain('foreign key (bookkeeping_record_id, business_id)')
    expect(migration).toContain("state in ('pending', 'processing', 'retryable', 'completed', 'dead_letter')")
    expect(migration).not.toMatch(/plaid_item|access_token|tax_treatment/i)
  })

  it('enqueues all new canonical records idempotently at the convergence point', () => {
    expect(migration).toContain('unique (business_id, bookkeeping_record_id, processing_reason, target_fingerprint)')
    expect(migration).toContain('create trigger bookkeeping_records_request_processing')
    expect(migration).toContain('after insert on public.bookkeeping_records')
    expect(migration).toContain('on conflict (business_id, bookkeeping_record_id, processing_reason, target_fingerprint)')
  })

  it('uses bounded skip-locked leases and trusted completion operations', () => {
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain('p_limit not between 1 and 25')
    expect(migration).toContain("(select auth.role()) <> 'service_role'")
    expect(migration).toContain('state = \'processing\' and lease_id = p_lease_id')
    expect(migration).toContain("attempt_count >= 8 then 'dead_letter'")
  })

  it('does not grant queue or worker mutations to customer roles', () => {
    expect(migration).toContain('revoke all on public.bookkeeping_processing_jobs from public, anon, authenticated')
    expect(migration).toContain('from public, anon, authenticated;')
    expect(migration).not.toMatch(/grant execute[^;]+to authenticated/is)
  })
})
