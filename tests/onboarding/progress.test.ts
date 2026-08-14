import { describe, expect, it } from 'vitest'
import {
  getFirstIncompleteOnboardingStep,
  type OnboardingBusinessData,
  type OnboardingVehicleData,
} from '../../app/lib/onboarding/progress'

function business(overrides: Partial<OnboardingBusinessData> = {}): OnboardingBusinessData {
  return {
    name: null,
    business_description: null,
    legal_structure: null,
    federal_tax_reporting_type: null,
    business_start_month: null,
    has_qualifying_home_office: null,
    home_office_square_feet: null,
    uses_vehicle_for_business: null,
    expected_financial_account_count: null,
    expected_financial_account_use: null,
    onboarding_start_method: null,
    onboarding_state: 'not_started',
    onboarding_version: null,
    onboarding_completed_at: null,
    ...overrides,
  }
}

const throughOrganization = {
  business_description: 'Independent design services',
  legal_structure: 'sole_proprietor',
  federal_tax_reporting_type: 'schedule_c',
}

const throughStart = {
  ...throughOrganization,
  business_start_month: '2025-01-01',
}

const throughHomeOffice = {
  ...throughStart,
  has_qualifying_home_office: false,
  home_office_square_feet: null,
}

const throughVehicles = {
  ...throughHomeOffice,
  uses_vehicle_for_business: false,
}

const throughAccounts = {
  ...throughVehicles,
  expected_financial_account_count: 0,
  expected_financial_account_use: null,
}

function vehicle(slot: 1 | 2): OnboardingVehicleData {
  return {
    slot,
    display_name: `Vehicle ${slot}`,
    vehicle_year: 2024,
    make: 'Toyota',
    model: 'Camry',
    is_mixed_use: true,
  }
}

describe('v2 onboarding progress', () => {
  it('starts an empty record at Business and does not require a name', () => {
    expect(getFirstIncompleteOnboardingStep(business(), [])).toBe('business')
    expect(
      getFirstIncompleteOnboardingStep(
        business({ business_description: 'Consulting', name: null }),
        []
      )
    ).toBe('organization')
  })

  it('selects each first incomplete persisted step in order', () => {
    expect(getFirstIncompleteOnboardingStep(business(throughOrganization), [])).toBe('start_date')
    expect(getFirstIncompleteOnboardingStep(business(throughStart), [])).toBe('home_office')
    expect(getFirstIncompleteOnboardingStep(business(throughHomeOffice), [])).toBe('vehicles')
    expect(getFirstIncompleteOnboardingStep(business(throughVehicles), [])).toBe('accounts')
    expect(getFirstIncompleteOnboardingStep(business(throughAccounts), [])).toBe('starting_method')
    expect(
      getFirstIncompleteOnboardingStep(
        business({ ...throughAccounts, onboarding_start_method: 'receipts' }),
        []
      )
    ).toBe('recommendation')
  })

  it('enforces home-office consistency', () => {
    expect(
      getFirstIncompleteOnboardingStep(
        business({ ...throughStart, has_qualifying_home_office: false, home_office_square_feet: 100 }),
        []
      )
    ).toBe('home_office')
    expect(
      getFirstIncompleteOnboardingStep(
        business({ ...throughStart, has_qualifying_home_office: true, home_office_square_feet: 100 }),
        []
      )
    ).toBe('vehicles')
  })

  it('requires one or two completed active vehicles for a yes answer', () => {
    const usesVehicles = business({ ...throughHomeOffice, uses_vehicle_for_business: true })
    expect(getFirstIncompleteOnboardingStep(usesVehicles, [])).toBe('vehicles')
    expect(getFirstIncompleteOnboardingStep(usesVehicles, [vehicle(1)])).toBe('accounts')
    expect(getFirstIncompleteOnboardingStep(usesVehicles, [vehicle(1), vehicle(2)])).toBe('accounts')
    expect(
      getFirstIncompleteOnboardingStep(usesVehicles, [
        vehicle(1),
        { ...vehicle(2), is_mixed_use: null },
      ])
    ).toBe('vehicles')
  })

  it('requires zero active vehicles for a no answer', () => {
    const noVehicles = business(throughVehicles)
    expect(getFirstIncompleteOnboardingStep(noVehicles, [])).toBe('accounts')
    expect(getFirstIncompleteOnboardingStep(noVehicles, [vehicle(1)])).toBe('vehicles')
  })

  it('enforces account count and use consistency', () => {
    expect(
      getFirstIncompleteOnboardingStep(
        business({ ...throughVehicles, expected_financial_account_count: 0, expected_financial_account_use: 'mixed_use' }),
        []
      )
    ).toBe('accounts')
    expect(
      getFirstIncompleteOnboardingStep(
        business({ ...throughVehicles, expected_financial_account_count: 2, expected_financial_account_use: 'mixed_use' }),
        []
      )
    ).toBe('starting_method')
  })

  it('does not branch on legacy Realtor or industry context', () => {
    const complete = business({
      ...throughAccounts,
      onboarding_start_method: 'receipts',
    })
    expect(
      getFirstIncompleteOnboardingStep(
        { ...complete, vertical: 'realtor', industry: 'realtor' } as OnboardingBusinessData,
        []
      )
    ).toBe('recommendation')
  })
})
