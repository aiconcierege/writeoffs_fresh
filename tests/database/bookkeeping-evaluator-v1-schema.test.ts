import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260820000200_activate_bookkeeping_evaluator_v1.sql',
), 'utf8')

describe('bookkeeping evaluator v1 queue activation', () => {
  it('versions provider-neutral work without writing accounting conclusions', () => {
    expect(sql).toContain("'deterministic_evaluation'")
    expect(sql).toContain("'bookkeeping-evaluator:v1:record:'")
    expect(sql).toContain('public.request_bookkeeping_processing(')
    expect(sql).not.toMatch(/insert into public\.bookkeeping_(decisions|allocations|review_events|tax_treatments)/i)
    expect(sql).not.toMatch(/plaid|personal|business_income|expense/i)
  })

  it('allows completed Phase 1A jobs to coexist with one evaluator-v1 request', () => {
    expect(sql).toContain('jobs.processing_reason = evaluator_reason')
    expect(sql).toContain("jobs.target_fingerprint =\n            'bookkeeping-evaluator:v1:record:'")
  })
})
