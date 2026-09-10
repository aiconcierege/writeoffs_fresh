import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20260908000400_add_business_context_and_account_use.sql', 'utf8')
const receiptProvenanceSql = readFileSync(
  'supabase/migrations/20260908000500_preserve_receipt_upload_provenance_on_attach.sql', 'utf8',
)
const existingReceiptAttachSql = readFileSync(
  'supabase/migrations/20260908000600_record_existing_receipt_attachment_without_fake_upload.sql', 'utf8',
)

describe('business context and account use schema', () => {
  it('stores account designations and assessments as immutable current-leaf histories', () => {
    expect(sql).toContain('create table public.financial_account_use_events')
    expect(sql).toContain("designation in('business_only','business_and_personal')")
    expect(sql).toContain('supersedes_event_id')
    expect(sql).toContain('financial_account_use_events_immutable')
    expect(sql).toContain('create table public.bookkeeping_business_context_assessments')
    expect(sql).toContain('evidence_references jsonb')
    expect(sql).toContain('evidence_fingerprint text')
  })

  it('is tenant-safe and keeps the onboarding expectation out of authority', () => {
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('owner_user_id=(select auth.uid())')
    expect(sql).not.toContain('expected_financial_account_use')
    expect(sql).toContain("auth.role())<>'service_role'")
  })

  it('enqueues reevaluation and fingerprints account/receipt changes', () => {
    expect(sql).toContain("'business_context_changed'")
    expect(sql).toContain('current_financial_account_use')
    expect(sql).toContain("e.event_type='uploaded'")
    expect(sql).toContain("e.provenance='user'")
    expect(sql).toContain('bookkeeping_document_links_enqueue_business_context')
  })

  it('provides a non-period-bound multi-fact meal answer path', () => {
    expect(sql).toContain('answer_bookkeeping_business_context_meal_issue')
    expect(sql).toContain('businessContextAssessmentId')
    expect(sql).not.toContain('p_review_period_id')
  })

  it('does not manufacture customer-upload provenance when an existing receipt is attached', () => {
    expect(receiptProvenanceSql).toContain('create or replace function public.attach_bookkeeping_receipt_journey')
    expect(receiptProvenanceSql).toContain("'uploaded','system',null")
    expect(receiptProvenanceSql).not.toContain("'uploaded','user',(select auth.uid())")
    expect(existingReceiptAttachSql).toContain("1,'matched'")
    expect(existingReceiptAttachSql).toContain("'uploadProvenance','unavailable'")
    expect(existingReceiptAttachSql).not.toContain("'uploaded','user'")
  })
})
