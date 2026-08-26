import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'

const migration=readFileSync('supabase/migrations/20260826000100_add_canonical_weekly_review_periods.sql','utf8')
const processing=readFileSync('app/lib/bookkeeping/weekly-review-processing.ts','utf8')

describe('canonical period-level weekly review',()=>{
 it('keeps cadence history and period boundaries immutable and Business scoped',()=>{
  expect(migration).toContain('business_review_cadence_events')
  expect(migration).toContain('effective_from date not null')
  expect(migration).toContain('timezone_name text not null')
  expect(migration).toContain('bookkeeping_review_periods_no_overlap')
  expect(migration).toContain('Weekly review history is append-only')
  expect(migration).toContain('enable row level security')
 })
 it('stores exact immutable presentation items and correction links',()=>{
  expect(migration).toContain('bookkeeping_review_snapshots')
  expect(migration).toContain('bookkeeping_review_snapshot_items')
  expect(migration).toContain('bookkeeping_decision_id uuid not null')
  expect(migration).toContain('display_label text not null')
  expect(migration).toContain('financial_transaction_id uuid')
  expect(migration).toContain("treatment text not null check(treatment in ('business','mixed_use'))")
  expect(migration).toContain('bookkeeping_review_correction_links')
  expect(migration).toContain('Only the exact presented review can be confirmed')
  expect(migration).toContain('where business_id=selected_business and correction_request_id=p_correction_request_id')
 })
 it('distinguishes no response, defer, correction, and confirmation',()=>{
  for(const state of ['closed_unreviewed','deferred','correction_linked','confirmed'])expect(migration).toContain(state)
  expect(processing).toContain('WEEKLY_REVIEW_RESPONSE_DAYS')
 })
 it('does not create empty periods or copy question batches',()=>{
  expect(processing).toContain('if(!relevant)continue')
  expect(processing).toContain("from('bookkeeping_review_events')")
  expect(processing).not.toContain("insert({ review_issue")
 })
})
