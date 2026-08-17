import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  'supabase/migrations/20260817000600_add_canonical_conflicting_evidence_answers.sql',
  'utf8'
)

describe('canonical conflicting-evidence migration contract', () => {
  it('has a trusted opener, separate fingerprint, and narrow customer RPC', () => {
    expect(sql).toContain('bookkeeping_conflict_fingerprint')
    expect(sql).toContain('open_bookkeeping_conflicting_evidence_issue')
    expect(sql).toContain('answer_bookkeeping_conflicting_evidence_review_issue')
    expect(sql).toContain("grant execute on function public.open_bookkeeping_conflicting_evidence_issue")
    expect(sql).toContain('to service_role')
    expect(sql).toContain('to authenticated')
    expect(sql).toContain("raise exception 'current bookkeeping decision changed'")
  })

  it('contains only the five narrow trusted outcomes and no legacy writes', () => {
    for (const outcome of ['COPY_CURRENT_DECISION', 'COPY_PRIOR_DECISION',
      'APPLY_VALIDATED_CANDIDATE', 'REMAIN_UNRESOLVED', 'OPEN_TYPED_FOLLOWUP']) {
      expect(sql).toContain(outcome)
    }
    expect(sql).not.toMatch(/update\s+public\.transactions/i)
    expect(sql).not.toMatch(/insert\s+into\s+public\.transactions/i)
    expect(sql).not.toMatch(/receipts\.transaction_id/i)
    expect(sql).not.toMatch(/category_key\s*=/i)
  })
})
