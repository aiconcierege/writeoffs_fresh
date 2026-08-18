import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  'supabase/migrations/20260818000100_add_customer_question_answers.sql',
  'utf8'
)

describe('customer question answer schema', () => {
  it('uses narrow authenticated functions and protects the helper', () => {
    expect(sql).toContain('answer_bookkeeping_customer_not_sure')
    expect(sql).toContain('answer_bookkeeping_mixed_use_all_business')
    expect(sql).toContain('answer_bookkeeping_mixed_use_personal_amount')
    expect(sql).toMatch(/revoke execute on function public\.apply_bookkeeping_customer_question_fact[\s\S]*from public, anon, authenticated/i)
    expect(sql).toMatch(/grant execute on function public\.answer_bookkeeping_customer_not_sure[\s\S]*to authenticated/i)
  })

  it('keeps actions append-only and avoids legacy or parallel state', () => {
    expect(sql).toContain("'answered'")
    expect(sql).toContain("'resolved'")
    expect(sql).toContain('append_bookkeeping_decision')
    expect(sql).not.toMatch(/update\s+public\.(transactions|bookkeeping_decisions|bookkeeping_review_events)/i)
    expect(sql).not.toMatch(/insert\s+into\s+public\.(transactions|receipts)/i)
  })
})
