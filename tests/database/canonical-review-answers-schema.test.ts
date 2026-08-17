import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260817000300_add_canonical_weekly_review_answers.sql',
  'utf8'
)

describe('canonical Weekly Review answer schema', () => {
  it('adds immutable answer context and one narrow atomic answer function', () => {
    expect(migration).toContain('add column question_context jsonb')
    expect(migration).toContain('add column answer_payload jsonb')
    expect(migration).toContain('add column resulting_decision_id uuid')
    expect(migration).toContain("event_type in ('opened', 'answered', 'skipped', 'resolved', 'reopened')")
    expect(migration).toContain('function public.answer_bookkeeping_business_purpose_review_issue')
    expect(migration).not.toContain('answer_bookkeeping_business_use')
    expect(migration).not.toContain('answer_bookkeeping_mixed_use')
  })

  it('copies established decision facts and clears automated confidence', () => {
    expect(migration).toContain('current_decision.bookkeeping_nature')
    expect(migration).toContain('current_decision.treatment')
    expect(migration).toContain("'tax_category_key', allocations.tax_category_key")
    expect(migration).toContain('current_decision.reason')
    expect(migration).toContain("'user',\n    null,")
  })

  it('rejects arbitrary fields and unsupported reasons in the database', () => {
    expect(migration).toContain("jsonb_object_keys(p_answer)) <> 2")
    expect(migration).toContain("current_event.reason <> 'BUSINESS_PURPOSE_NEEDED'")
    expect(migration).toContain('answer processing is not implemented for this review reason')
    for (const forbidden of [
      'transactions.needs_review', 'transactions.approved',
      'transactions.category_key', 'receipts.transaction_id', 'receipt_waived',
    ]) expect(migration).not.toContain(forbidden)
  })

  it('checks event, decision, context, and canonical evidence atomically', () => {
    expect(migration).toContain('p_expected_current_event_id')
    expect(migration).toContain('p_expected_current_decision_id')
    expect(migration).toContain('p_expected_context_fingerprint')
    expect(migration).toContain('p_expected_evidence_fingerprint')
    expect(migration).toContain('current_bookkeeping_evidence_fingerprint')
    expect(migration).toContain('pg_advisory_xact_lock')
  })

  it('allows only authenticated answer execution', () => {
    expect(migration).toContain('from public, anon;')
    expect(migration).toContain('to authenticated;')
    expect(migration).toContain("owner_user_id = (select auth.uid())")
  })
})
