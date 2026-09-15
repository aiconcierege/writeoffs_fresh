import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const migration=readFileSync('supabase/migrations/20260915000100_preserve_meal_question_assessment_history.sql','utf8')
describe('meal follow-up assessment history repair',()=>{
 it('reads the immutable established assessment attached to the question',()=>{
  expect(migration).toContain('from public.bookkeeping_business_context_assessments a')
  expect(migration).not.toContain('from public.current_bookkeeping_business_context a')
  expect(migration).toContain("a.id=(e.question_context->>'businessContextAssessmentId')::uuid")
  expect(migration).toContain("a.assessment_state='established'")
 })
 it('retains tenant, current evidence, decision and event checks under the transaction lock',()=>{
  for(const guard of ['b.owner_user_id=(select auth.uid())','pg_advisory_xact_lock',
   's.supersedes_event_id=e.id','current_bookkeeping_evidence_fingerprint(e.business_id,e.bookkeeping_record_id)',
   's.supersedes_decision_id=x.id','d.id<>e.based_on_decision_id',
   'e.context_fingerprint<>p_expected_context_fingerprint','a.business_id=e.business_id',
   'a.bookkeeping_record_id=e.bookkeeping_record_id'])expect(migration).toContain(guard)
  expect(migration).toContain('from public,anon,service_role')
  expect(migration).toContain('to authenticated')
 })
 it('preserves the existing atomic answer and follow-up implementation except for the history read',()=>{
  const original=readFileSync('supabase/migrations/20260908000400_add_business_context_and_account_use.sql','utf8')
  const start=original.indexOf('create or replace function public.answer_bookkeeping_business_context_meal_issue(')
  expect(migration.slice(migration.indexOf('create or replace function'))).toBe(original.slice(start).replace('from public.current_bookkeeping_business_context a','from public.bookkeeping_business_context_assessments a'))
 })
})
