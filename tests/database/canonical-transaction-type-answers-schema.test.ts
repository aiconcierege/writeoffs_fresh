import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260817000500_add_canonical_transaction_type_answers.sql',
  'utf8'
)

describe('canonical transaction-type answer schema', () => {
  it('adds one narrow authenticated answer function', () => {
    expect(migration).toContain(
      'function public.answer_bookkeeping_transaction_type_review_issue'
    )
    expect(migration).toContain('from public, anon;')
    expect(migration).toContain('to authenticated;')
    expect(migration).not.toContain('answer_bookkeeping_conflicting_evidence')
  })

  it('maps only semantic activities and leaves other unmapped', () => {
    for (const mapping of [
      "when 'purchase' then 'expense'",
      "when 'earned_money' then 'business_income'",
      "when 'moved_money' then 'transfer'",
      "when 'paid_card' then 'credit_card_payment'",
      "when 'received_refund' then 'refund'",
      "when 'added_own_money' then 'owner_contribution'",
      "when 'borrowed_money' then 'loan_proceeds'",
    ]) expect(migration).toContain(mapping)
    expect(migration).toContain('else null')
    expect(migration).not.toContain("when 'other' then 'other_non_income'")
  })

  it('verifies prior facts from immutable answered events', () => {
    expect(migration).toContain("event_type = 'answered'")
    expect(migration).toContain("origin_answer.reason = 'BUSINESS_USE_UNCLEAR'")
    expect(migration).toContain("origin_answer.reason = 'MIXED_USE_CLARIFICATION'")
    expect(migration).toContain("answer_payload ->> 'use' = 'mixed'")
    expect(migration).toContain('business-use facts require immutable answer history')
  })

  it('derives exact outcomes and only approved typed follow-ups', () => {
    expect(migration).toContain("follow_up_reason := 'BUSINESS_USE_UNCLEAR'")
    expect(migration).toContain("follow_up_reason := 'MIXED_USE_CLARIFICATION'")
    expect(migration).toContain("follow_up_reason := 'BUSINESS_PURPOSE_NEEDED'")
    expect(migration).toContain("follow_up_reason := 'CONFLICTING_EVIDENCE'")
    expect(migration).toContain('personal_amount := authoritative_amount - business_amount')
    expect(migration).toContain("decision_treatment := 'excluded'")
    expect(migration).not.toContain('GENERIC_APPROVAL')
  })

  it('uses authenticated identity and complete staleness protections', () => {
    expect(migration).toContain('owner_user_id = (select auth.uid())')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('p_expected_current_event_id')
    expect(migration).toContain('p_expected_current_decision_id')
    expect(migration).toContain('p_expected_context_fingerprint')
    expect(migration).toContain('p_expected_evidence_fingerprint')
    expect(migration).toContain('current_bookkeeping_evidence_fingerprint')
  })

  it('contains no legacy writes', () => {
    for (const forbidden of [
      'transactions.needs_review', 'transactions.approved',
      'transactions.category_key', 'receipts.transaction_id',
      'receipt_waived',
    ]) expect(migration).not.toContain(forbidden)
  })
})
