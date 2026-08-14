import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260814000100_add_v2_onboarding_foundation.sql'
  ),
  'utf8'
)

const originalBusinessMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260722000200_create_businesses.sql'),
  'utf8'
)

describe('v2 onboarding Business foundation', () => {
  it('keeps legacy entity and vertical compatibility data unchanged', () => {
    expect(originalBusinessMigration).toContain('entity_type text')
    expect(originalBusinessMigration).toContain('industry text')
    expect(originalBusinessMigration).toContain('home_office_configuration jsonb')
    expect(migration).not.toMatch(/drop\s+column\s+(entity_type|industry|home_office_configuration)/i)
    expect(migration).not.toMatch(/rename\s+column\s+entity_type/i)
    expect(migration).not.toMatch(/alter\s+column\s+entity_type/i)
    expect(migration).not.toMatch(/public\.profiles/i)
  })

  it('stores legal structure separately from federal tax reporting type', () => {
    expect(migration).toContain('add column legal_structure text')
    expect(migration).toContain('add column federal_tax_reporting_type text')

    for (const value of [
      'sole_proprietor',
      'single_member_llc',
      'partnership_multi_member_llc',
      'corporation',
      'not_sure',
    ]) {
      expect(migration).toContain(`'${value}'`)
    }

    for (const value of [
      'schedule_c',
      's_corporation',
      'c_corporation',
      'partnership',
    ]) {
      expect(migration).toContain(`'${value}'`)
    }
  })

  it('adds nullable v2 onboarding answers without fabricating values', () => {
    expect(migration).toContain('add column business_description text')
    expect(migration).toContain('add column business_start_month date')
    expect(migration).toContain('add column onboarding_version smallint')
    expect(migration).toContain('add column has_qualifying_home_office boolean')
    expect(migration).toContain('add column home_office_square_feet smallint')
    expect(migration).not.toMatch(/add column (legal_structure|federal_tax_reporting_type|business_description|business_start_month|onboarding_version|has_qualifying_home_office|home_office_square_feet)[^,;]*not null/i)
    expect(migration).not.toMatch(/update\s+public\.businesses/i)
  })

  it('adds a versionable onboarding workflow with a non-answer default', () => {
    expect(migration).toContain("add column onboarding_state text not null default 'not_started'")
    expect(migration).toContain("onboarding_state in ('not_started', 'in_progress', 'completed')")
    expect(migration).toContain('onboarding_version is null or onboarding_version >= 1')
  })

  it('constrains month and simplified home-office inputs while allowing partial progress', () => {
    expect(migration).toContain('extract(day from business_start_month) = 1')
    expect(migration).toContain('home_office_square_feet between 1 and 10000')
    expect(migration).toContain('home_office_square_feet is null')
    expect(migration).toContain('has_qualifying_home_office is true')
  })
})
