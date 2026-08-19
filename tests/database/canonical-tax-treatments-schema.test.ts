import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20260819000500_add_canonical_tax_treatments.sql', 'utf8')

describe('canonical tax-treatment schema', () => {
  it('is append-only, allocation-scoped, and non-branching', () => {
    expect(sql).toContain('create table public.bookkeeping_tax_treatments')
    expect(sql).toContain('bookkeeping_tax_treatments_one_root_idx')
    expect(sql).toContain('bookkeeping_tax_treatments_one_successor_idx')
    expect(sql).toContain('bookkeeping_tax_treatments_idempotency_idx')
    expect(sql).toContain('bookkeeping_tax_treatments_reject_update')
    expect(sql).toContain('bookkeeping_tax_treatments_allocation_fkey')
    expect(sql).toContain('returns trigger language plpgsql security definer')
  })

  it('does not treat a category alone as deductible', () => {
    expect(sql).toContain("treatment_status in ('unresolved','deductible','not_deductible')")
    expect(sql).toContain('rule_version > 0')
    expect(sql).toContain('tax treatment category must match the canonical allocation')
    expect(sql).toContain('deductible amount exceeds the signed canonical allocation')
  })

  it('allows customer reads but only trusted service writes', () => {
    expect(sql).toContain('alter table public.bookkeeping_tax_treatments enable row level security')
    expect(sql).toContain('revoke all on public.bookkeeping_tax_treatments from public, anon, authenticated')
    expect(sql).toContain('grant select on public.bookkeeping_tax_treatments to authenticated')
    expect(sql).toContain('grant select, insert on public.bookkeeping_tax_treatments to service_role')
    expect(sql).not.toMatch(/policy[^;]+for insert to authenticated/is)
  })
})
