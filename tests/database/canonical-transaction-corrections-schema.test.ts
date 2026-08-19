import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260819000300_add_canonical_transaction_corrections.sql'), 'utf8')
describe('canonical transaction corrections schema', () => {
  it('derives identity, locks the record, and appends user history', () => {
    expect(sql).toContain('authenticated_user_id uuid := (select auth.uid())')
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain("'user', authenticated_user_id, null")
    expect(sql).toContain('supersedes_decision_id')
  })
  it('is idempotent and preserves exact signed allocation arithmetic', () => {
    expect(sql).toContain('correction_request_id')
    expect(sql).toContain('signed_business := source_transaction.amount_cents - signed_personal')
    expect(sql).toContain("sign(source_transaction.amount_cents) * personal_magnitude")
  })
  it('cannot mutate source facts or accept customer accounting outcomes', () => {
    expect(sql).not.toMatch(/update\s+public\.financial_transactions/i)
    expect(sql).not.toMatch(/delete\s+from/i)
    expect(sql).not.toMatch(/category_key\s*:=\s*p_|bookkeeping_nature\s*:=\s*p_/i)
    expect(sql).toContain("current_decision.bookkeeping_nature is distinct from 'expense'")
  })
  it('exposes only the narrow authenticated function', () => {
    expect(sql).toContain('from public, anon, service_role')
    expect(sql).toContain('to authenticated')
  })
})
