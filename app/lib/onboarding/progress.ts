import {
  EXPECTED_FINANCIAL_ACCOUNT_USES,
  FEDERAL_TAX_REPORTING_TYPES,
  LEGAL_STRUCTURES,
  ONBOARDING_START_METHODS,
  validateOnboardingVehicle,
} from './validation'

export const ONBOARDING_UI_STEPS = [
  'business',
  'organization',
  'start_date',
  'home_office',
  'vehicles',
  'accounts',
  'starting_method',
  'recommendation',
  'review',
] as const

export type OnboardingUiStep = (typeof ONBOARDING_UI_STEPS)[number]

export type OnboardingBusinessData = {
  name: string | null
  business_description: string | null
  legal_structure: string | null
  federal_tax_reporting_type: string | null
  business_start_month: string | null
  has_qualifying_home_office: boolean | null
  home_office_square_feet: number | null
  uses_vehicle_for_business: boolean | null
  expected_financial_account_count: number | null
  expected_financial_account_use: string | null
  onboarding_start_method: string | null
  onboarding_state: string
  onboarding_version: number | null
  onboarding_completed_at: string | null
}

export type OnboardingVehicleData = {
  slot: 1 | 2
  display_name: string
  vehicle_year: number | null
  make: string | null
  model: string | null
  is_mixed_use: boolean | null
}

function includesValue(values: readonly string[], value: unknown) {
  return typeof value === 'string' && values.includes(value)
}

function businessStepComplete(business: OnboardingBusinessData) {
  const description = business.business_description?.trim() ?? ''
  return description.length >= 1 && description.length <= 2000
}

function organizationStepComplete(business: OnboardingBusinessData) {
  return (
    includesValue(LEGAL_STRUCTURES, business.legal_structure) &&
    includesValue(
      FEDERAL_TAX_REPORTING_TYPES,
      business.federal_tax_reporting_type
    )
  )
}

function startDateStepComplete(business: OnboardingBusinessData, now: Date) {
  const value = business.business_start_month
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(value)) return false
  const currentMonth = `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1
  ).padStart(2, '0')}`
  return value.slice(0, 7) <= currentMonth
}

function homeOfficeStepComplete(business: OnboardingBusinessData) {
  if (typeof business.has_qualifying_home_office !== 'boolean') return false
  if (!business.has_qualifying_home_office) {
    return business.home_office_square_feet === null
  }
  return (
    Number.isInteger(business.home_office_square_feet) &&
    Number(business.home_office_square_feet) >= 1 &&
    Number(business.home_office_square_feet) <= 10000
  )
}

function vehiclesStepComplete(
  business: OnboardingBusinessData,
  vehicles: OnboardingVehicleData[]
) {
  if (typeof business.uses_vehicle_for_business !== 'boolean') return false
  if (!business.uses_vehicle_for_business) return vehicles.length === 0
  if (vehicles.length < 1 || vehicles.length > 2) return false
  if (new Set(vehicles.map((vehicle) => vehicle.slot)).size !== vehicles.length) {
    return false
  }
  return vehicles.every(
    (vehicle) =>
      (vehicle.slot === 1 || vehicle.slot === 2) &&
      validateOnboardingVehicle({
        display_name: vehicle.display_name,
        vehicle_year: vehicle.vehicle_year,
        make: vehicle.make,
        model: vehicle.model,
        is_mixed_use: vehicle.is_mixed_use,
      }).ok
  )
}

function accountsStepComplete(business: OnboardingBusinessData) {
  const count = business.expected_financial_account_count
  if (!Number.isInteger(count) || Number(count) < 0 || Number(count) > 6) {
    return false
  }
  if (count === 0) return business.expected_financial_account_use === null
  return includesValue(
    EXPECTED_FINANCIAL_ACCOUNT_USES,
    business.expected_financial_account_use
  )
}

export function getFirstIncompleteOnboardingStep(
  business: OnboardingBusinessData,
  vehicles: OnboardingVehicleData[],
  now = new Date()
): OnboardingUiStep {
  if (!businessStepComplete(business)) return 'business'
  if (!organizationStepComplete(business)) return 'organization'
  if (!startDateStepComplete(business, now)) return 'start_date'
  if (!homeOfficeStepComplete(business)) return 'home_office'
  if (!vehiclesStepComplete(business, vehicles)) return 'vehicles'
  if (!accountsStepComplete(business)) return 'accounts'
  if (!includesValue(ONBOARDING_START_METHODS, business.onboarding_start_method)) {
    return 'starting_method'
  }
  return 'recommendation'
}
