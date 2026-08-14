import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260814000200_add_v2_onboarding_intake_preferences.sql'
  ),
  'utf8'
)

describe('v2 onboarding intake preferences', () => {
  it('adds all four intake answers as nullable Business columns', () => {
    for (const definition of [
      'add column uses_vehicle_for_business boolean',
      'add column expected_financial_account_count smallint',
      'add column expected_financial_account_use text',
      'add column onboarding_start_method text',
    ]) {
      expect(migration).toContain(definition)
      expect(migration).not.toMatch(
        new RegExp(`${definition}[^,;]*not\\s+null`, 'i')
      )
    }
  })

  it('restricts the expected account count to zero through six', () => {
    expect(migration).toContain(
      'expected_financial_account_count between 0 and 6'
    )
    expect(migration).toContain('expected_financial_account_count is null')
  })

  it('restricts expected overall account use to the approved values', () => {
    expect(migration).toContain('expected_financial_account_use is null')
    expect(migration).toContain("'primarily_business'")
    expect(migration).toContain("'mixed_use'")
  })

  it('restricts the starting method to the approved values', () => {
    expect(migration).toContain('onboarding_start_method is null')
    expect(migration).toContain("'receipts'")
    expect(migration).toContain("'connected_financial_accounts'")
    expect(migration).toContain("'statement_uploads'")
  })

  it('does not backfill users or change onboarding workflow state', () => {
    expect(migration).not.toMatch(/\b(update|insert|delete|truncate)\b/i)
    expect(migration).not.toMatch(/\b(onboarding_state|onboarding_version)\b/i)
  })

  it('does not alter legacy compatibility fields or related tables', () => {
    expect(migration).not.toMatch(
      /\b(entity_type|industry|home_office_configuration|vertical)\b/i
    )
    expect(migration).not.toMatch(
      /\b(financial_accounts|financial_transactions)\b/i
    )
    expect(migration).not.toMatch(/\b(create|alter)\s+table\s+public\.business_vehicles\b/i)
  })
})
