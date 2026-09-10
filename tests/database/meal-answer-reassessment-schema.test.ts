import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20260908000200_reassess_meal_facts_after_answers.sql', 'utf8')

describe('meal answer reassessment migration', () => {
  it('persists both extracted facts and only opens a genuinely missing follow-up', () => {
    expect(sql).toContain("if attendee is null then next_fact_type:='meal_attendee_relationship'")
    expect(sql).toContain("elsif purpose is null and nullif(btrim(d.business_purpose),'') is null")
    expect(sql).toContain("case when next_fact_type is null then 'resolved' else 'needs_review' end")
    expect(sql).toContain("'attendeeRelationship',attendee,'businessPurpose',purpose")
  })

  it('preserves tenant, current-leaf, and fingerprint checks', () => {
    expect(sql).toContain('b.owner_user_id=(select auth.uid())')
    expect(sql).toContain("e.event_type not in('opened','skipped','reopened')")
    expect(sql).toContain('current_bookkeeping_evidence_fingerprint')
    expect(sql).toContain('pg_advisory_xact_lock')
  })
})
