import{readFileSync}from'node:fs'
import{describe,expect,it}from'vitest'

const sql=readFileSync('supabase/migrations/20260901000200_add_betti_weekly_review_v3.sql','utf8')

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
