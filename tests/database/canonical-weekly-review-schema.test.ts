import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260817000200_add_canonical_weekly_review_events.sql',
  'utf8'
)

describe('canonical Weekly Review schema', () => {
  it('allows only typed material questions and append-only events', () => {
    for (const reason of [
      'BUSINESS_USE_UNCLEAR', 'BUSINESS_PURPOSE_NEEDED', 'MIXED_USE_CLARIFICATION',
      'TRANSACTION_TYPE_UNCLEAR', 'CONFLICTING_EVIDENCE',
    ]) expect(migration).toContain(`'${reason}'`)
    expect(migration).not.toContain("'GENERIC_APPROVAL'")
    expect(migration).not.toContain("'SELECT_CATEGORY'")
    expect(migration).toContain("event_type in ('opened', 'skipped', 'resolved', 'reopened')")
    expect(migration).toContain('bookkeeping_review_events_reject_update_delete')
    expect(migration).toContain('bookkeeping_review_events_one_successor_idx')
  })

  it('uses typed event leaves rather than decision status as the queue', () => {
    expect(migration).toContain('function public.list_current_bookkeeping_review_issues')
    expect(migration).toContain("events.event_type in ('opened', 'reopened')")
    expect(migration).toContain("events.event_type = 'skipped'")
    expect(migration).not.toContain('transactions.needs_review')
    expect(migration).not.toContain('category_key')
  })

  it('separates customer and trusted operations', () => {
    expect(migration).toContain('bookkeeping_review_events_select_own_business')
    expect(migration).toContain('to authenticated;')
    expect(migration).toContain('to service_role;')
    expect(migration).toContain("'user', (select auth.uid())")
    expect(migration).toContain("'automation', null")
  })
})
