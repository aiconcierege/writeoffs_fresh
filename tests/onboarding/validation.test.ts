import { describe, expect, it } from 'vitest'
import {
  FEDERAL_TAX_REPORTING_TYPES,
  LEGAL_STRUCTURES,
  validateOnboardingBusinessPatch,
} from '../../app/lib/onboarding/validation'

function validUpdate(input: unknown) {
  const result = validateOnboardingBusinessPatch(
    input,
    new Date('2026-08-14T12:00:00Z')
  )
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  return result.update
}

describe('v2 onboarding Business validation', () => {
  it('trims Business text and converts an empty optional name to null', () => {
    expect(
      validUpdate({
        step: 'business',
        data: { name: '   ', business_description: '  Mobile mechanic  ' },
      })
    ).toEqual({ name: null, business_description: 'Mobile mechanic' })
  })

  it('requires a bounded business description and bounds the optional name', () => {
    for (const data of [
      { name: 'x'.repeat(201), business_description: 'Repairs vehicles' },
      { name: 'Shop', business_description: '  ' },
      { name: 'Shop', business_description: 'x'.repeat(2001) },
    ]) {
      expect(validateOnboardingBusinessPatch({ step: 'business', data }).ok).toBe(false)
    }
  })

  it('accepts every approved organization value without deriving either answer', () => {
    for (const legal_structure of LEGAL_STRUCTURES) {
      for (const federal_tax_reporting_type of FEDERAL_TAX_REPORTING_TYPES) {
        expect(
          validUpdate({
            step: 'organization',
            data: { legal_structure, federal_tax_reporting_type },
          })
        ).toEqual({ legal_structure, federal_tax_reporting_type })
      }
    }
  })

  it('rejects unapproved organization and starting-method values', () => {
    expect(
      validateOnboardingBusinessPatch({
        step: 'organization',
        data: { legal_structure: 'llc', federal_tax_reporting_type: 'schedule_c' },
      }).ok
    ).toBe(false)
    expect(
      validateOnboardingBusinessPatch({
        step: 'starting_method',
        data: { onboarding_start_method: 'plaid' },
      }).ok
    ).toBe(false)
  })

  it('stores a valid start month as its first day and rejects future months', () => {
    expect(
      validUpdate({ step: 'start_date', data: { business_start_month: '2026-08' } })
    ).toEqual({ business_start_month: '2026-08-01' })
    expect(
      validateOnboardingBusinessPatch(
        { step: 'start_date', data: { business_start_month: '2026-09' } },
        new Date('2026-08-14T12:00:00Z')
      ).ok
    ).toBe(false)
  })

  it.each(['1998-01', '2010-06', '2020-12'])(
    'accepts the historical business start month %s',
    (business_start_month) => {
      expect(
        validUpdate({ step: 'start_date', data: { business_start_month } })
      ).toEqual({ business_start_month: `${business_start_month}-01` })
    }
  )

  it('requires home-office details when applicable and clears them otherwise', () => {
    expect(
      validUpdate({
        step: 'home_office',
        data: { has_qualifying_home_office: false, home_office_square_feet: 300 },
      })
    ).toEqual({
      has_qualifying_home_office: false,
      home_office_square_feet: null,
    })
    for (const squareFeet of [0, 1.5, 10001, null]) {
      expect(
        validateOnboardingBusinessPatch({
          step: 'home_office',
          data: {
            has_qualifying_home_office: true,
            home_office_square_feet: squareFeet,
          },
        }).ok
      ).toBe(false)
    }
  })

  it('validates only the vehicle intake answer without accepting vehicle data', () => {
    expect(
      validUpdate({ step: 'vehicles', data: { uses_vehicle_for_business: true } })
    ).toEqual({ uses_vehicle_for_business: true })
    expect(
      validateOnboardingBusinessPatch({
        step: 'vehicles',
        data: { uses_vehicle_for_business: true, vehicles: [{ slot: 1 }] },
      }).ok
    ).toBe(false)
  })

  it('requires account use above zero and clears it at zero', () => {
    expect(
      validUpdate({
        step: 'accounts',
        data: {
          expected_financial_account_count: 0,
          expected_financial_account_use: 'mixed_use',
        },
      })
    ).toEqual({
      expected_financial_account_count: 0,
      expected_financial_account_use: null,
    })
    expect(
      validateOnboardingBusinessPatch({
        step: 'accounts',
        data: { expected_financial_account_count: 2 },
      }).ok
    ).toBe(false)
    expect(
      validUpdate({
        step: 'accounts',
        data: {
          expected_financial_account_count: 6,
          expected_financial_account_use: 'primarily_business',
        },
      })
    ).toEqual({
      expected_financial_account_count: 6,
      expected_financial_account_use: 'primarily_business',
    })
  })

  it('rejects unknown root and step fields, including protected fields', () => {
    for (const input of [
      { step: 'vehicles', business_id: 'other', data: { uses_vehicle_for_business: true } },
      { step: 'vehicles', data: { uses_vehicle_for_business: true, industry: 'realtor' } },
      { step: 'business', data: { business_description: 'Work', entity_type: 'llc' } },
      { step: 'business', data: { business_description: 'Work', owner_user_id: 'other' } },
      { step: 'business', data: { business_description: 'Work', accounting_method: 'accrual' } },
    ]) {
      expect(validateOnboardingBusinessPatch(input).ok).toBe(false)
    }
  })
})
