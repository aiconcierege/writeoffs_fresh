import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const sql=readFileSync('supabase/migrations/20260825000100_add_durable_document_processing.sql','utf8')

describe('durable document processing schema',()=>{
  it('extends the existing queue with Business-owned document targets and terminal states',()=>{
    expect(sql).toContain('create table public.business_documents');expect(sql).toContain('alter table public.receipt_processing_jobs add column document_id')
    for(const state of ['needs_attention','unreadable','dead_letter'])expect(sql).toContain(`'${state}'`)
    expect(sql).toContain('receipt_processing_jobs_target_check')
  })
  it('enforces exact dedupe, skip-locked typed claims, bounded retry, and append-only results',()=>{
    expect(sql).toContain('business_documents_fingerprint_unique unique (business_id,upload_fingerprint)')
    expect(sql).toContain('for update skip locked');expect(sql).toContain('attempt_count<6')
    expect(sql).toContain('document_processing_results_append_only');expect(sql).toContain('claim_receipt_processing_jobs_by_type')
    expect(sql).toContain('requeue_terminal_document_processing_job')
  })
  it('keeps customer access tenant-scoped and operational state service-controlled',()=>{
    expect(sql).toContain('business_documents_select_own');expect(sql).toContain('owner_user_id=(select auth.uid())')
    expect(sql).toContain('revoke all on public.document_processing_results from public,anon,authenticated')
    expect(sql).toContain('grant select on public.document_processing_observability to service_role')
  })
})
