import fs from 'node:fs';import path from 'node:path';import {describe,expect,it} from 'vitest'
const sql=fs.readFileSync(path.join(process.cwd(),'supabase/migrations/20260825000200_add_statement_intelligence.sql'),'utf8').toLowerCase()
describe('statement intelligence schema',()=>{
  it('is Business-scoped, exact-cent, immutable, and tenant protected',()=>{expect(sql).toContain('create table public.statement_periods')
    expect(sql).toContain('create table public.statement_transaction_observations');expect(sql).toContain('amount_cents bigint not null')
    expect(sql).toContain('enable row level security');expect(sql).toContain('statement source observations are immutable')})
  it('uses canonical financial transactions and bookkeeping records',()=>{expect(sql).toContain("import_method in ('provider','csv','statement')")
    expect(sql).toContain("public.ensure_bookkeeping_record(job.business_id,'financial_transaction'")
    expect(sql).toContain('public.ensure_initial_bookkeeping_decision')})
  it('supports resumable chunks and exact observation identities',()=>{expect(sql).toContain('continue_document_processing_job')
    expect(sql).toContain('statement_observations_evidence_unique');expect(sql).toContain('next_page integer not null default 1')})
})
