import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260827000100_add_weekly_review_category_labels.sql', 'utf8',
)

describe('weekly review category snapshot schema', () => {
  it('stores a bounded nullable label in the immutable snapshot item', () => {
    expect(migration).toContain('add column category_label text')
    expect(migration).toContain('category_label is null')
    expect(migration).toContain('p_unresolved_question_count,p_activity_fingerprint,2)')
    expect(migration).toContain("nullif(trim(item->>'categoryLabel'),'')")
  })

  it('keeps the presentation RPC service-only', () => {
    expect(migration).toContain('from public,anon,authenticated')
    expect(migration).toContain('to service_role')
  })
})
