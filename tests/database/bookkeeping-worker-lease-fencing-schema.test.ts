import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20260908000700_fix_bookkeeping_worker_lease_fencing.sql', 'utf8')
const runtimeSql = readFileSync('supabase/migrations/20260909000100_harden_bookkeeping_worker_runtime.sql', 'utf8')

describe('bookkeeping worker lease fencing migration', () => {
  it('uses the lease token as the transition fence without accepting a reclaimed lease', () => {
    expect(sql).toContain("where id = p_job_id and state = 'processing' and lease_id = p_lease_id")
    expect(sql).not.toContain('and lease_expires_at > now()')
    expect(sql).toContain("raise exception 'bookkeeping processing lease is no longer owned'")
  })

  it('keeps transition functions restricted to the service role', () => {
    expect(sql).toContain('from public, anon, authenticated')
    expect(sql).toContain('to service_role')
  })
})

describe('bookkeeping worker runtime hardening', () => {
  it('serializes active work by Business and records append-only diagnostics', () => {
    expect(runtimeSql).toMatch(/active\.business_id=jobs\.business_id/)
    expect(runtimeSql).toContain('bookkeeping_processing_attempt_events')
    expect(runtimeSql).toMatch(/before update or delete/)
    expect(runtimeSql).toContain('retry_bookkeeping_processing_job_diagnostic')
  })

  it('provides a bounded audited recovery path without changing conclusions', () => {
    expect(runtimeSql).toContain('recover_bookkeeping_processing_jobs')
    expect(runtimeSql).toMatch(/coalesce\(array_length\(p_job_ids,1\),0\) not between 1 and 500/)
    expect(runtimeSql).not.toMatch(/update public\.bookkeeping_(?:decisions|tax_treatments|allocations)/)
  })
})
