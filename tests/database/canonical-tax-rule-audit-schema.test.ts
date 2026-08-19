import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20260819000600_prepare_canonical_tax_rule_audit.sql', 'utf8')

describe('canonical tax-rule audit schema', () => {
  it('adds downstream audit metadata without changing bookkeeping allocations', () => {
    expect(sql).toContain('alter table public.bookkeeping_tax_treatments')
    expect(sql).toContain('tax_year integer')
    expect(sql).toContain('factual_basis jsonb')
    expect(sql).toContain('authority_references jsonb')
    expect(sql).not.toMatch(/alter table public\.bookkeeping_allocations[\s\S]+(?:amount_cents|allocation_kind)/i)
    expect(sql).not.toMatch(/update\s+public\.(?:bookkeeping_allocations|bookkeeping_decisions|financial_transactions)/i)
  })

  it('preserves special and missing-fact outcomes without claiming a deduction', () => {
    expect(sql).toContain("'requires_facts'")
    expect(sql).toContain("'special_treatment'")
    expect(sql).toMatch(/treatment_status in \('requires_facts','special_treatment'\)[\s\S]+deductible_amount_cents is null/i)
  })

  it('contains no rule data or active tax conclusion', () => {
    expect(sql).not.toMatch(/insert into/i)
    expect(sql).not.toMatch(/meals|gift|mileage|section.?179|home.?office/i)
  })
})
