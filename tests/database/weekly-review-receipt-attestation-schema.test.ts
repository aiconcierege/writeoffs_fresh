import{readFileSync}from'node:fs'
import{describe,expect,it}from'vitest'

const sql=readFileSync('supabase/migrations/20260902000300_add_weekly_receipt_unavailable_attestation.sql','utf8')
const route=readFileSync('app/api/bookkeeping/reviews/[id]/workflow/route.ts','utf8')
const weekly=readFileSync('app/home/WeeklyReview.tsx','utf8')

describe('weekly receipt-unavailable attestation contract',()=>{
 it('atomically records separate documentation and business-use facts',()=>{
  expect(sql).toContain('public.mark_bookkeeping_receipt_lost')
  expect(sql).toContain('public.correct_imported_transaction_personal_scope')
  expect(sql).toContain('Customer confirmed that this purchase was still for the business.')
  expect(sql).toContain('allocation.allocation_kind, allocation.amount_cents')
  expect(sql).toContain("p_business_use not in ('business', 'personal')")
  expect(sql).toContain("'{\"schemaVersion\":1,\"assertion\":\"receipt_lost\"}'::jsonb")
 })
 it('enforces current tenant, period, source, workflow, decision, and documentation leaves',()=>{
  expect(sql).toContain('owner_user_id = authenticated_user_id')
  expect(sql).toContain('record.occurred_on between period.period_start and period.period_end')
  expect(sql).toContain('source.revoked_at is null')
  expect(sql).toContain('successor.supersedes_event_id = event.id')
  expect(sql).toContain('successor.supersedes_decision_id = decision.id')
  expect(sql).toContain('p_expected_workflow_event_id')
  expect(sql).toContain('p_expected_documentation_event_id')
 })
 it('is idempotent, authenticated-only, and uses a fixed empty search path',()=>{
  expect(sql).toContain('where business_id = selected_business_id and request_id = p_request_id')
  expect(sql).toContain("'idempotent', true")
  expect(sql).toContain("set search_path = ''")
  expect(sql).toContain('from public, anon, authenticated, service_role')
  expect(sql).toContain('to authenticated')
 })
 it('blocks the legacy include-missing shortcut for version 3 without breaking compatibility',()=>{
  expect(sql).toContain('complete_weekly_missing_documentation_decision_legacy_internal')
  expect(sql).toContain("p_decision = 'include_missing'")
  expect(sql).toContain("expected_workflow.details ->> 'flowVersion' = '3'")
  expect(sql).toContain('Version 3 requires an explicit receipt-unavailable business-use answer')
  expect(route).toContain("flowVersion===3&&decision==='include_missing'")
 })
 it('uses the guarded route only after the customer supplies both facts',()=>{
  expect(weekly).toContain('I don’t have the receipt')
  expect(weekly).toContain('Is this still a business expense?')
  expect(weekly).toContain('Yes, it was for my business')
  expect(weekly).toContain('No, leave it out')
  expect(weekly).toContain("documentationDecision:'receipt_unavailable_attestation'")
  expect(weekly).not.toContain('onClick={()=>void decideMissing(item)}>Missing receipt</button>')
  expect(route).toContain("supabase.rpc('attest_weekly_receipt_unavailable'")
  expect(route).toContain("['request_opened','reopened','evidence_attached','acknowledged_pending'].includes(event.event_type)")
 })
})
