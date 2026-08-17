import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260817000400_add_canonical_business_use_answers.sql',
  'utf8'
)

describe('canonical business-use answer schema', () => {
  it('adds only the two narrow authenticated answer functions', () => {
    expect(migration).toContain(
      'function public.answer_bookkeeping_business_use_review_issue'
    )
    expect(migration).toContain(
      'function public.answer_bookkeeping_mixed_use_review_issue'
    )
    expect(migration).toContain('from public, anon;')
    expect(migration).toContain('to authenticated;')
    expect(migration).not.toContain('answer_bookkeeping_transaction_type')
    expect(migration).not.toContain('answer_bookkeeping_conflicting_evidence')
  })

  it('accepts exact factual contracts and derives outcomes internally', () => {
    expect(migration).toContain("p_answer ->> 'use' not in ('business', 'personal', 'mixed')")
    expect(migration).toContain("jsonb_object_keys(p_answer)) <> 2")
    expect(migration).toContain("'amount_cents', authoritative_amount")
    expect(migration).toContain('business_amount := case when authoritative_amount < 0')
    expect(migration).toContain('personal_amount := authoritative_amount - business_amount')
    expect(migration).toContain('business_amount + personal_amount <> authoritative_amount')
  })

  it('keeps mixed incomplete until the dollar fact and nature are known', () => {
    expect(migration).toContain("follow_up_reason := case when selected_use = 'mixed'")
    expect(migration).toContain("then 'MIXED_USE_CLARIFICATION' else 'TRANSACTION_TYPE_UNCLEAR'")
    expect(migration).toContain("decision_treatment := 'unresolved'")
    expect(migration).toContain("decision_allocations := '[]'::jsonb")
    expect(migration).toContain("decision_treatment := 'mixed_use'")
  })

  it('rechecks identity, ownership, context, evidence and current leaves', () => {
    expect(migration).toContain('owner_user_id = (select auth.uid())')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('p_expected_current_event_id')
    expect(migration).toContain('p_expected_current_decision_id')
    expect(migration).toContain('p_expected_context_fingerprint')
    expect(migration).toContain('p_expected_evidence_fingerprint')
    expect(migration).toContain('current_bookkeeping_evidence_fingerprint')
  })

  it('does not write legacy state or expose customer bookkeeping controls', () => {
    for (const forbidden of [
      'transactions.needs_review',
      'transactions.approved',
      'transactions.category_key',
      'receipts.transaction_id',
      'receipt_waived',
    ]) expect(migration).not.toContain(forbidden)
    expect(migration).not.toContain("p_answer -> 'percentage'")
    expect(migration).not.toContain("p_answer -> 'treatment'")
    expect(migration).not.toContain("p_answer -> 'category'")
  })
})
