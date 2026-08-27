import{describe,expect,it}from'vitest'
import{readFileSync}from'node:fs'
const sql=readFileSync('supabase/migrations/20260827000300_complete_weekly_review_canonical_decisions.sql','utf8')

describe('weekly review canonical decision completion',()=>{
 it('allows an unresolved imported source to become personal without inventing a nature',()=>{
  expect(sql).toContain("treatment in ('personal','excluded')")
  expect(sql).toContain('correct_imported_transaction_personal_scope')
  expect(sql).toContain("current_decision.bookkeeping_nature,'personal'")
  expect(sql).toContain("'Customer identified this imported activity as personal.'")
  expect(sql).toContain('complete_weekly_personal_sweep')
  expect(sql).toContain("'personal','stage_completed'")
 })
 it('resolves downstream questions and reopens them only through append-only reversal',()=>{
  expect(sql).toContain("event.event_type in('opened','skipped','reopened')")
  expect(sql).toContain('issue.evidence_fingerprint')
  expect(sql).toContain('issue.question_context')
  expect(sql).toContain("'resolved'")
  expect(sql).toContain("p_action not in ('personal','restore_previous')")
  expect(sql).toContain("'reopened'")
  expect(sql).toContain('Customer reversed the prior personal decision.')
 })
 it('persists one atomic idempotent missing-documentation batch',()=>{
  expect(sql).toContain('bookkeeping_weekly_documentation_batches')
  expect(sql).toContain('unique(business_id,request_id)')
  expect(sql).toContain('public.mark_bookkeeping_receipt_lost')
  expect(sql).toContain('Documentation decisions are incomplete for this review')
  expect(sql).toContain("'documentation','stage_completed'")
 })
 it('keeps missing-documentation exclusion distinct from personal',()=>{
  expect(sql).toContain("current_decision.bookkeeping_nature,'excluded'")
  expect(sql).toContain("new_decision.id,'excluded',selected_record_doc.amount_cents")
  expect(sql).toContain('restore_documentation_excluded_transaction')
  expect(sql).not.toContain("supporting documentation is unavailable.','personal'")
 })
 it('scopes every mutation through the authenticated Business and exposes authenticated RPCs only',()=>{
  expect(sql.match(/owner_user_id=\(select auth.uid\(\)\)/g)?.length).toBeGreaterThanOrEqual(3)
  expect(sql).toContain('enable row level security')
  expect(sql).toContain('from public,anon,service_role')
  expect(sql).toContain('to authenticated')
 })
})
