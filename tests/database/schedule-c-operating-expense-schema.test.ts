import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20260908000800_add_schedule_c_operating_expense_coverage.sql', 'utf8')

describe('Schedule C operating-expense schema', () => {
  it('uses one append-only tenant-scoped assessment history', () => {
    expect(sql).toMatch(/create table public\.schedule_c_expense_assessments/i)
    expect(sql).toMatch(/supersedes_assessment_id uuid/i)
    expect(sql).toMatch(/schedule_c_expense_assessments_immutable/i)
    expect(sql).toMatch(/enable row level security/i)
    expect(sql).toMatch(/owner_user_id=\(select auth\.uid\(\)\)/i)
    expect(sql).not.toMatch(/grant (?:all|insert|update|delete)[^;]*authenticated/i)
  })

  it('keeps classification, containment, and tax treatment distinct', () => {
    expect(sql).toMatch(/assessment_status in\('ordinary','needs_facts','special_treatment','unsupported'\)/i)
    expect(sql).toMatch(/schedule_c_category_key text references public\.categories/i)
    expect(sql).toMatch(/special_treatment_reason text/i)
    expect(sql).not.toMatch(/deductible_amount_cents/i)
    expect(sql).not.toMatch(/business_allocation/i)
  })

  it('adds the supported reporting categories and schedules nondestructive reevaluation', () => {
    for (const key of ['commissions','contract-labor','insurance','interest','legal-professional','rent-other',
      'repairs','taxes-licenses','travel','utilities','software','postage','fees','other']) {
      expect(sql).toContain(`('${key}'`)
    }
    expect(sql).toMatch(/request_bookkeeping_processing/i)
    expect(sql).not.toMatch(/^\s*(?:delete\s+from|truncate|drop\s+table)\b/im)
  })
})
