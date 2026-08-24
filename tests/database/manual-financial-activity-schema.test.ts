import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
const sql=readFileSync(resolve(process.cwd(),'supabase/migrations/20260824000300_add_canonical_manual_financial_activity.sql'),'utf8')
describe('canonical manual financial activity schema',()=>{
  it('preserves immutable customer source facts and append-only corrections',()=>{
    expect(sql).toContain('create table public.manual_financial_sources')
    expect(sql).toContain('create table public.manual_financial_source_events')
    expect(sql).toContain('manual financial source history is append-only')
    expect(sql).toContain("provenance text not null default 'user'")
  })
  it('enforces exact signs, tenant scope, current leaves, and idempotency',()=>{
    expect(sql).toContain("direction = 'received' and original_amount_cents > 0")
    expect(sql).toContain("direction = 'spent' and original_amount_cents < 0")
    expect(sql).toContain('manual_financial_source_events_successor_idx')
    expect(sql).toContain('manual_financial_sources_request_unique')
    expect(sql).toContain('manual financial Business ownership mismatch')
  })
  it('uses canonical decisions, queueing, and compound current resolution',()=>{
    expect(sql).toContain("'business_income'")
    expect(sql).toContain("'expense'")
    expect(sql).toContain('request_bookkeeping_processing')
    expect(sql).toContain('bookkeeping_compound_reconciliations')
    expect(sql).toContain('manual match is ambiguous')
  })
})
