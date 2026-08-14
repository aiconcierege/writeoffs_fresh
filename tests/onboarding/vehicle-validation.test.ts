import { describe, expect, it } from 'vitest'
import { validateOnboardingVehicle } from '../../app/lib/onboarding/validation'

describe('v2 onboarding vehicle validation', () => {
  it('trims a complete vehicle and normalizes empty optional text', () => {
    expect(
      validateOnboardingVehicle({
        display_name: '  Work truck  ',
        vehicle_year: 2024,
        make: '  Ford ',
        model: '   ',
        is_mixed_use: true,
      })
    ).toEqual({
      ok: true,
      update: {
        display_name: 'Work truck',
        vehicle_year: 2024,
        make: 'Ford',
        model: null,
        is_mixed_use: true,
      },
    })
  })

  it('allows optional year, make, and model to be omitted', () => {
    expect(
      validateOnboardingVehicle({ display_name: 'Car', is_mixed_use: false })
    ).toEqual({
      ok: true,
      update: {
        display_name: 'Car',
        vehicle_year: null,
        make: null,
        model: null,
        is_mixed_use: false,
      },
    })
  })

  it('rejects invalid names, years, and missing mixed-use answers', () => {
    for (const input of [
      { display_name: ' ', is_mixed_use: false },
      { display_name: 'x'.repeat(121), is_mixed_use: false },
      { display_name: 'Car', vehicle_year: 1899, is_mixed_use: false },
      { display_name: 'Car', vehicle_year: 2101, is_mixed_use: false },
      { display_name: 'Car', vehicle_year: 2020.5, is_mixed_use: false },
      { display_name: 'Car' },
    ]) {
      expect(validateOnboardingVehicle(input).ok).toBe(false)
    }
  })

  it('rejects identity, Business, and excluded vehicle-detail fields', () => {
    for (const field of [
      'id',
      'business_id',
      'slot',
      'archived_at',
      'vin',
      'license_plate',
      'acquisition_cost',
      'lease_details',
      'depreciation_information',
      'ownership_documents',
    ]) {
      expect(
        validateOnboardingVehicle({
          display_name: 'Car',
          is_mixed_use: false,
          [field]: 'forbidden',
        }).ok,
        field
      ).toBe(false)
    }
  })
})
