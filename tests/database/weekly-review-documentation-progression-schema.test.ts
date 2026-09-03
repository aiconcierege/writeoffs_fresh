import{readFileSync}from'node:fs'
import{describe,expect,it}from'vitest'

const sql=readFileSync('supabase/migrations/20260902000400_allow_weekly_documentation_progression.sql','utf8')
const route=readFileSync('app/api/bookkeeping/reviews/[id]/workflow/route.ts','utf8')
const readModel=readFileSync('app/lib/bookkeeping/receipt-workflow.ts','utf8')

describe('weekly documentation progression schema',()=>{
 it('adds one append-only customer pending acknowledgement that stays outstanding',()=>{
  expect(sql).toContain("'acknowledged_pending'")
  expect(sql).toContain('receipt_expected_later')
  expect(sql).toContain("events.event_type in('request_opened','reopened','acknowledged_pending')")
  expect(sql).toContain("new.provenance<>'user'")
  expect(sql).toContain('new.actor_user_id is null')
 })
 it('guards the acknowledgement by tenant, period, source, workflow, decision, evidence and request id',()=>{
  expect(sql).toContain('acknowledge_weekly_documentation_pending')
  expect(sql).toContain('owner_user_id=(select auth.uid())')
  expect(sql).toContain('record.occurred_on between period.period_start and period.period_end')
  expect(sql).toContain('p_expected_current_decision_id')
  expect(sql).toContain('p_expected_documentation_event_id')
  expect(sql).toContain('request_id=p_request_id')
  expect(sql).toContain('current_bookkeeping_evidence_fingerprint')
  expect(sql).toContain('set search_path=\'\'')
  expect(sql).toContain('from public,anon,authenticated,service_role')
 })
 it('completes only the v3 documentation conversation and leaves requests untouched',()=>{
  const completion=sql.slice(sql.indexOf('create function public.complete_weekly_documentation_stage_v3'),
    sql.indexOf('alter function public.attest_weekly_receipt_unavailable'))
  expect(completion).toContain("'documentation','stage_completed'")
  expect(completion).toContain("'completionMeaning','reviewed_for_now'")
  expect(completion).toContain('list_current_bookkeeping_documentation_requests')
  expect(completion).not.toContain('insert into public.bookkeeping_documentation_events')
  expect(completion).not.toContain('bookkeeping_decisions(')
 })
 it('retains current-documentation discoverability for bounded Home follow-up',()=>{
  expect(readModel).toContain("rpc('list_current_bookkeeping_documentation_requests'")
  expect(readModel).toContain('outstandingDocumentation')
  expect(route).toContain("decision==='continue_with_open'")
  expect(route).toContain("decision==='acknowledged_pending'")
 })
 it('keeps receipt attachment and unavailable attestation valid after acknowledgement',()=>{
  expect(sql).toContain("'evidence_attached','acknowledged_pending'")
  expect(sql).toContain("predecessor.event_type='acknowledged_pending'")
  expect(sql).toContain('attest_weekly_receipt_unavailable_before_pending')
 })
})
