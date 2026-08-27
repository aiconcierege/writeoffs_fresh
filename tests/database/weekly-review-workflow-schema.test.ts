import{describe,expect,it}from'vitest'
import{readFileSync}from'node:fs'
const sql=readFileSync('supabase/migrations/20260827000200_add_weekly_review_workflow_events.sql','utf8')
describe('weekly review workflow schema',()=>{
 it('stores append-only ordered stage evidence without copying questions',()=>{
  expect(sql).toContain('bookkeeping_weekly_review_workflow_events')
  expect(sql).toContain("'personal','mixed','questions','documentation','mileage','final'")
  expect(sql).toContain('reject_weekly_review_history_mutation')
  expect(sql).not.toContain('question_id')
 })
 it('is tenant scoped and customer RPC is authenticated only',()=>{
  expect(sql).toContain('enable row level security')
  expect(sql).toContain('owner_user_id=(select auth.uid())')
  expect(sql).toContain('grant execute on function public.append_weekly_review_workflow_event')
  expect(sql).toContain('to authenticated')
 })
})
