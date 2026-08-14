import { describe, expect, it } from 'vitest'
import { validateCompleteOnboarding } from '../../app/lib/onboarding/validation'

function completeBusiness(overrides: Record<string, unknown> = {}) {
  return {
    business_description: 'Independent software consulting',
    legal_structure: 'sole_proprietor',
    federal_tax_reporting_type: 'schedule_c',
    business_start_month: '2024-01-01',
    has_qualifying_home_office: false,
    home_office_square_feet: null,
    uses_vehicle_for_business: false,
    expected_financial_account_count: 0,
    expected_financial_account_use: null,
    onboarding_start_method: 'receipts',
    ...overrides,
  }
}

function vehicle(slot: 1 | 2, overrides: Record<string, unknown> = {}) {
  return {
    slot,
    display_name: `Vehicle ${slot}`,
    vehicle_year: 2024,
    make: 'Toyota',
    model: 'Camry',
    is_mixed_use: true,
    ...overrides,
  }
}

describe('v2 onboarding completion validation', () => {
  it('rejects an incomplete Business with clear field errors', () => {
    const result = validateCompleteOnboarding({}, [])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected validation errors')
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('business_description'),
        expect.stringContaining('legal_structure'),
        expect.stringContaining('federal_tax_reporting_type'),
        expect.stringContaining('business_start_month'),
        expect.stringContaining('has_qualifying_home_office'),
        expect.stringContaining('uses_vehicle_for_business'),
        expect.stringContaining('expected_financial_account_count'),
        expect.stringContaining('onboarding_start_method'),
      ])
    )
  })

  it('enforces home-office answer consistency', () => {
    expect(
      validateCompleteOnboarding(
        completeBusiness({
          has_qualifying_home_office: true,
          home_office_square_feet: null,
        }),
        []
      ).ok
    ).toBe(false)
    expect(
      validateCompleteOnboarding(
        completeBusiness({
          has_qualifying_home_office: false,
          home_office_square_feet: 100,
        }),
        []
      ).ok
    ).toBe(false)
    expect(
      validateCompleteOnboarding(
        completeBusiness({
          has_qualifying_home_office: true,
          home_office_square_feet: 100,
        }),
        []
      ).ok
    ).toBe(true)
  })

  it('requires zero active vehicles for no and one or two valid vehicles for yes', () => {
    expect(validateCompleteOnboarding(completeBusiness(), []).ok).toBe(true)
    expect(validateCompleteOnboarding(completeBusiness(), [vehicle(1)]).ok).toBe(false)

    const vehicleBusiness = completeBusiness({ uses_vehicle_for_business: true })
    expect(validateCompleteOnboarding(vehicleBusiness, []).ok).toBe(false)
    expect(validateCompleteOnboarding(vehicleBusiness, [vehicle(1)]).ok).toBe(true)
    expect(
      validateCompleteOnboarding(vehicleBusiness, [vehicle(1), vehicle(2)]).ok
    ).toBe(true)
    expect(
      validateCompleteOnboarding(vehicleBusiness, [vehicle(1), vehicle(2), vehicle(1)]).ok
    ).toBe(false)
  })

  it('rejects incomplete vehicles and duplicate or invalid slots', () => {
    const business = completeBusiness({ uses_vehicle_for_business: true })
    expect(
      validateCompleteOnboarding(business, [vehicle(1, { is_mixed_use: null })]).ok
    ).toBe(false)
    expect(validateCompleteOnboarding(business, [vehicle(1), vehicle(1)]).ok).toBe(false)
    expect(validateCompleteOnboarding(business, [vehicle(1, { slot: 3 })]).ok).toBe(false)
  })

  it('enforces account count and overall-use consistency', () => {
    expect(
      validateCompleteOnboarding(
        completeBusiness({ expected_financial_account_use: 'mixed_use' }),
        []
      ).ok
    ).toBe(false)
    expect(
      validateCompleteOnboarding(
        completeBusiness({
          expected_financial_account_count: 2,
          expected_financial_account_use: null,
        }),
        []
      ).ok
    ).toBe(false)
    expect(
      validateCompleteOnboarding(
        completeBusiness({
          expected_financial_account_count: 2,
          expected_financial_account_use: 'mixed_use',
          onboarding_start_method: 'connected_financial_accounts',
        }),
        []
      ).ok
    ).toBe(true)
  })

  it('does not require a name, legacy vertical, industry, or entity fields', () => {
    expect(
      validateCompleteOnboarding(
        completeBusiness({
          name: null,
          vertical: 'realtor',
          industry: 'realtor',
          entity_type: null,
        }),
        []
      ).ok
    ).toBe(true)
  })
})
