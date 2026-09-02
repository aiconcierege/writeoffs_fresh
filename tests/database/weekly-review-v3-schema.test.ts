import{readFileSync}from'node:fs'
import{describe,expect,it}from'vitest'

const sql=readFileSync('supabase/migrations/20260901000200_add_betti_weekly_review_v3.sql','utf8')
const eligibilityFix=readFileSync('supabase/migrations/20260902000100_fix_weekly_review_v3_mixed_eligibility.sql','utf8')
const completionFix=readFileSync('supabase/migrations/20260902000200_enforce_weekly_review_v3_mixed_completion.sql','utf8')

describe('Weekly Review v3 database contract',()=>{
 it('assigns v3 only to untouched workflows and preserves v2 and legacy orders',()=>{
  expect(sql).toContain('when current_event.id is null then 3')
  expect(sql).toContain("flow_version=2")
  expect(sql).toContain("when 'personal' then 'mixed'")
  expect(sql).toContain("else 'documentation' end")
  expect(sql).toContain("when 'documentation' then 'questions'")
 })
 it('opens mixed clarifications without appending a bookkeeping decision',()=>{
  const opener=sql.slice(sql.indexOf('create or replace function public.open_weekly_mixed_clarifications'),sql.indexOf('create or replace function public.answer_bookkeeping_mixed_use_percentage'))
  expect(opener).toContain("'MIXED_USE_CLARIFICATION'")
  expect(opener).toContain("'stage_reopened'")
  expect(opener).not.toContain('append_bookkeeping_decision')
  expect(opener).toContain("d.id=(item->>'decisionId')::uuid")
 })
 it('uses fixed-point database rounding and exact remainder',()=>{
  expect(sql).toContain("business_magnitude:=floor((magnitude::numeric*basis_points+5000)/10000)::bigint")
  expect(sql).toContain('personal_magnitude:=magnitude-business_magnitude')
  expect(sql).toContain('business_basis_points')
 })
 it('denies anon and exposes only authenticated RPC execution',()=>{
  expect(sql).toContain('from public,anon,service_role')
  expect(sql).toContain('to authenticated')
  expect(sql).toContain("owner_user_id=(select auth.uid())")
 })
 it('enforces material snapshot blockers at the database boundary',()=>{
  expect(sql).toContain('bookkeeping_review_snapshots_v3_readiness')
  expect(sql).toContain("Version 3 review has a material unresolved fact")
  expect(sql).toContain("workflow.stage<>'final'")
 })
})

describe('Weekly Review v3 mixed completion invariant',()=>{
 it('blocks direct mixed completion from authoritative current issue leaves',()=>{
  expect(completionFix).toContain("p_stage='mixed' and p_event_type='stage_completed'")
  expect(completionFix).toContain("event.reason='MIXED_USE_CLARIFICATION'")
  expect(completionFix).toContain('successor.supersedes_event_id=event.id')
  expect(completionFix).toContain('A selected shared expense still needs its business portion')
 })
 it('provides service-only append-only recovery with period and workflow checks',()=>{
  expect(completionFix).toContain('recover_weekly_review_v3_mixed_stage')
  expect(completionFix).toContain("'mixed','stage_reopened'")
  expect(completionFix).toContain("'unresolved_mixed_allocation_after_stage_completion'")
  expect(completionFix).toContain('event.review_snapshot_id is not null')
  expect(completionFix).toContain('to service_role')
  expect(completionFix).toContain('from public,anon,authenticated,service_role')
 })
})

describe('Weekly Review v3 mixed-use eligibility correction',()=>{
 it('accepts only unresolved or established expense-direction decision leaves',()=>{
  expect(eligibilityFix).toContain("d.bookkeeping_nature = 'expense' and d.treatment in ('business', 'unresolved')")
  expect(eligibilityFix).toContain("d.bookkeeping_nature is null and d.treatment = 'unresolved'")
  expect(eligibilityFix).toContain('successor.supersedes_decision_id = d.id')
  expect(eligibilityFix).toContain('financial.amount_cents >= 0')
  expect(eligibilityFix).toContain('active_source_count <> 1')
 })
 it('rejects competing current issues without allocating money',()=>{
  expect(eligibilityFix).toContain("event.reason <> 'MIXED_USE_CLARIFICATION'")
  expect(eligibilityFix).toContain("'Another material fact must be resolved first'")
  expect(eligibilityFix).not.toContain('append_bookkeeping_decision')
  expect(eligibilityFix).not.toContain('bookkeeping_allocations')
 })
 it('preserves tenant, period, workflow, source, idempotency, and ACL boundaries',()=>{
  expect(eligibilityFix).toContain('owner_user_id = (select auth.uid())')
  expect(eligibilityFix).toContain('occurred_on between period.period_start and period.period_end')
  expect(eligibilityFix).toContain("workflow.details ->> 'flowVersion' <> '3'")
  expect(eligibilityFix).toContain("s.financial_transaction_id = (item ->> 'transactionId')::uuid")
  expect(eligibilityFix).toContain("'idempotent', true")
  expect(eligibilityFix).toContain('set search_path = \'\'')
  expect(eligibilityFix).toContain('from public, anon, authenticated, service_role')
  expect(eligibilityFix).toContain('to authenticated')
 })
})
