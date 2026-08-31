import{describe,expect,it}from'vitest'
import{readFileSync}from'node:fs'

const sql=readFileSync('supabase/migrations/20260831000100_guide_weekly_review_evidence_first.sql','utf8')

describe('guided weekly review persisted order',()=>{
 it('versions new reviews without rewriting historical events',()=>{
  expect(sql).toContain("'flowVersion',2")
  expect(sql).toContain("current_event.details->>'flowVersion'='2'")
  expect(sql).not.toMatch(/update\s+public\.bookkeeping_weekly_review_workflow_events/i)
  expect(sql).not.toMatch(/delete\s+from\s+public\.bookkeeping_weekly_review_workflow_events/i)
 })
 it('uses evidence before questions and removes mileage from the new mandatory path',()=>{
  expect(sql).toContain("when 'personal' then 'documentation'")
  expect(sql).toContain("when 'documentation' then 'questions'")
  expect(sql).toContain("when 'questions' then 'final'")
  expect(sql).toContain("when 'documentation' then 'mileage'")
 })
 it('freezes customer-visible exception and documentation counts in the immutable snapshot',()=>{
  expect(sql).toContain('personal_excluded_count')
  expect(sql).toContain('missing_documentation_count')
  expect(sql).toContain('p_activity_fingerprint,3')
  expect(sql).not.toContain('jsonb_array_length(p_items)=0')
 })
})
