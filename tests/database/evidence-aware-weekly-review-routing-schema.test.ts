import{readFileSync}from'node:fs';import{describe,expect,it}from'vitest'
const sql=readFileSync('supabase/migrations/20260908000100_add_evidence_aware_weekly_review_routing.sql','utf8')
describe('evidence-aware weekly review routing migration',()=>{
 it('supports direct v3 mixed-use history without weakening legacy validation',()=>{
  expect(sql).toContain("a.question_context->>'flowVersion'='3'")
  expect(sql).toContain('answer_bookkeeping_transaction_type_review_issue_legacy')
  expect(sql).toContain("origin_resolved.resulting_decision_id is distinct from d.id")
  expect(sql).toContain('business_amount:=case when amount<0')
 })
 it('routes receipt-supported meals through business status, attendee, then purpose',()=>{
  expect(sql).toContain("'establishedFacts',jsonb_build_array('purchase','meal')")
  expect(sql).toContain("when not fact_exists then 'meal_attendee_relationship'")
  expect(sql).toContain("else 'receipt_meal_business_purpose'")
  expect(sql).toContain("'follow_up_event_id',follow_up")
 })
 it('keeps ownership, fingerprints, append-only decisions, and narrow grants',()=>{
  expect(sql).toContain('owner_user_id=(select auth.uid())')
  expect(sql).toContain('current_bookkeeping_evidence_fingerprint')
  expect(sql).toContain('append_bookkeeping_decision')
  expect(sql).toContain('from public,anon,service_role')
 })
})
