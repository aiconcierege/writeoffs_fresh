export const LEGAL_STRUCTURES = [
  'sole_proprietor',
  'single_member_llc',
  'partnership_multi_member_llc',
  'corporation',
  'not_sure',
] as const

export const FEDERAL_TAX_REPORTING_TYPES = [
  'schedule_c',
  's_corporation',
  'c_corporation',
  'partnership',
  'not_sure',
] as const

export const EXPECTED_FINANCIAL_ACCOUNT_USES = [
  'primarily_business',
  'mixed_use',
] as const

export const ONBOARDING_START_METHODS = [
  'receipts',
  'connected_financial_accounts',
  'statement_uploads',
] as const

export const ONBOARDING_BUSINESS_STEPS = [
  'business',
  'organization',
  'start_date',
  'home_office',
  'vehicles',
  'accounts',
  'starting_method',
] as const

export type OnboardingBusinessStep = (typeof ONBOARDING_BUSINESS_STEPS)[number]

export type OnboardingBusinessUpdate = Record<
  string,
  string | number | boolean | null
>

export type ValidationResult =
  | { ok: true; step: OnboardingBusinessStep; update: OnboardingBusinessUpdate }
  | { ok: false; error: string }

export type OnboardingVehicleUpdate = {
  display_name: string
  vehicle_year: number | null
  make: string | null
  model: string | null
  is_mixed_use: boolean
}

export type VehicleValidationResult =
  | { ok: true; update: OnboardingVehicleUpdate }
  | { ok: false; error: string }

const BUSINESS_NAME_MAX_LENGTH = 200
const BUSINESS_DESCRIPTION_MAX_LENGTH = 2000
const HOME_OFFICE_SQUARE_FEET_MAX = 10000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  allowed: T
): value is T[number] {
  return typeof value === 'string' && allowed.includes(value as T[number])
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function invalid(error: string): ValidationResult {
  return { ok: false, error }
}

function invalidVehicle(error: string): VehicleValidationResult {
  return { ok: false, error }
}

function optionalTrimmedText(value: unknown, field: string) {
  if (value === undefined || value === null) {
    return { ok: true as const, value: null }
  }
  if (typeof value !== 'string') {
    return { ok: false as const, error: `${field} must be a string or null` }
  }
  return { ok: true as const, value: value.trim() || null }
}

export function validateOnboardingVehicle(
  input: unknown
): VehicleValidationResult {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, [
      'display_name',
      'vehicle_year',
      'make',
      'model',
      'is_mixed_use',
    ])
  ) {
    return invalidVehicle('vehicle contains unsupported fields')
  }

  if (typeof input.display_name !== 'string') {
    return invalidVehicle('display_name is required')
  }
  const displayName = input.display_name.trim()
  if (!displayName) return invalidVehicle('display_name is required')
  if (displayName.length > 120) {
    return invalidVehicle('display_name must be 120 characters or fewer')
  }

  const year = input.vehicle_year
  if (
    year !== undefined &&
    year !== null &&
    (!Number.isInteger(year) || Number(year) < 1900 || Number(year) > 2100)
  ) {
    return invalidVehicle('vehicle_year must be a whole number from 1900 to 2100')
  }

  const make = optionalTrimmedText(input.make, 'make')
  if (!make.ok) return invalidVehicle(make.error)
  const model = optionalTrimmedText(input.model, 'model')
  if (!model.ok) return invalidVehicle(model.error)

  if (typeof input.is_mixed_use !== 'boolean') {
    return invalidVehicle('is_mixed_use is required')
  }

  return {
    ok: true,
    update: {
      display_name: displayName,
      vehicle_year: year === undefined || year === null ? null : Number(year),
      make: make.value,
      model: model.value,
      is_mixed_use: input.is_mixed_use,
    },
  }
}

function validateBusiness(data: Record<string, unknown>): ValidationResult {
  if (!hasOnlyKeys(data, ['name', 'business_description'])) {
    return invalid('business step contains unsupported fields')
  }

  const update: OnboardingBusinessUpdate = {}
  if ('name' in data) {
    if (data.name !== null && typeof data.name !== 'string') {
      return invalid('name must be a string or null')
    }
    const name = typeof data.name === 'string' ? data.name.trim() : ''
    if (name.length > BUSINESS_NAME_MAX_LENGTH) {
      return invalid('name must be 200 characters or fewer')
    }
    update.name = name || null
  }

  if (typeof data.business_description !== 'string') {
    return invalid('business_description is required')
  }
  const description = data.business_description.trim()
  if (!description) return invalid('business_description is required')
  if (description.length > BUSINESS_DESCRIPTION_MAX_LENGTH) {
    return invalid('business_description must be 2000 characters or fewer')
  }
  update.business_description = description

  return { ok: true, step: 'business', update }
}

function validateOrganization(data: Record<string, unknown>): ValidationResult {
  if (!hasOnlyKeys(data, ['legal_structure', 'federal_tax_reporting_type'])) {
    return invalid('organization step contains unsupported fields')
  }
  if (!isOneOf(data.legal_structure, LEGAL_STRUCTURES)) {
    return invalid('legal_structure is invalid')
  }
  if (!isOneOf(data.federal_tax_reporting_type, FEDERAL_TAX_REPORTING_TYPES)) {
    return invalid('federal_tax_reporting_type is invalid')
  }

  return {
    ok: true,
    step: 'organization',
    update: {
      legal_structure: data.legal_structure,
      federal_tax_reporting_type: data.federal_tax_reporting_type,
    },
  }
}

function validateStartDate(
  data: Record<string, unknown>,
  now: Date
): ValidationResult {
  if (!hasOnlyKeys(data, ['business_start_month'])) {
    return invalid('start_date step contains unsupported fields')
  }
  if (
    typeof data.business_start_month !== 'string' ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.business_start_month)
  ) {
    return invalid('business_start_month must use YYYY-MM format')
  }

  const currentMonth = `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1
  ).padStart(2, '0')}`
  if (data.business_start_month > currentMonth) {
    return invalid('business_start_month cannot be later than the current month')
  }

  return {
    ok: true,
    step: 'start_date',
    update: { business_start_month: `${data.business_start_month}-01` },
  }
}

function validateHomeOffice(data: Record<string, unknown>): ValidationResult {
  if (
    !hasOnlyKeys(data, [
      'has_qualifying_home_office',
      'home_office_square_feet',
    ])
  ) {
    return invalid('home_office step contains unsupported fields')
  }
  if (typeof data.has_qualifying_home_office !== 'boolean') {
    return invalid('has_qualifying_home_office is required')
  }

  if (!data.has_qualifying_home_office) {
    return {
      ok: true,
      step: 'home_office',
      update: {
        has_qualifying_home_office: false,
        home_office_square_feet: null,
      },
    }
  }

  if (
    !Number.isInteger(data.home_office_square_feet) ||
    Number(data.home_office_square_feet) < 1 ||
    Number(data.home_office_square_feet) > HOME_OFFICE_SQUARE_FEET_MAX
  ) {
    return invalid('home_office_square_feet must be a whole number from 1 to 10000')
  }

  return {
    ok: true,
    step: 'home_office',
    update: {
      has_qualifying_home_office: true,
      home_office_square_feet: Number(data.home_office_square_feet),
    },
  }
}

function validateVehicles(data: Record<string, unknown>): ValidationResult {
  if (!hasOnlyKeys(data, ['uses_vehicle_for_business'])) {
    return invalid('vehicles step contains unsupported fields')
  }
  if (typeof data.uses_vehicle_for_business !== 'boolean') {
    return invalid('uses_vehicle_for_business is required')
  }
  return {
    ok: true,
    step: 'vehicles',
    update: { uses_vehicle_for_business: data.uses_vehicle_for_business },
  }
}

function validateAccounts(data: Record<string, unknown>): ValidationResult {
  if (
    !hasOnlyKeys(data, [
      'expected_financial_account_count',
      'expected_financial_account_use',
    ])
  ) {
    return invalid('accounts step contains unsupported fields')
  }

  const count = data.expected_financial_account_count
  if (!Number.isInteger(count) || Number(count) < 0 || Number(count) > 6) {
    return invalid('expected_financial_account_count must be an integer from 0 to 6')
  }

  if (count === 0) {
    return {
      ok: true,
      step: 'accounts',
      update: {
        expected_financial_account_count: 0,
        expected_financial_account_use: null,
      },
    }
  }
  if (!isOneOf(data.expected_financial_account_use, EXPECTED_FINANCIAL_ACCOUNT_USES)) {
    return invalid('expected_financial_account_use is required')
  }

  return {
    ok: true,
    step: 'accounts',
    update: {
      expected_financial_account_count: Number(count),
      expected_financial_account_use: data.expected_financial_account_use,
    },
  }
}

function validateStartingMethod(data: Record<string, unknown>): ValidationResult {
  if (!hasOnlyKeys(data, ['onboarding_start_method'])) {
    return invalid('starting_method step contains unsupported fields')
  }
  if (!isOneOf(data.onboarding_start_method, ONBOARDING_START_METHODS)) {
    return invalid('onboarding_start_method is invalid')
  }
  return {
    ok: true,
    step: 'starting_method',
    update: { onboarding_start_method: data.onboarding_start_method },
  }
}

export function validateOnboardingBusinessPatch(
  input: unknown,
  now = new Date()
): ValidationResult {
  if (!isRecord(input) || !hasOnlyKeys(input, ['step', 'data'])) {
    return invalid('request contains unsupported fields')
  }
  if (!isOneOf(input.step, ONBOARDING_BUSINESS_STEPS)) {
    return invalid('onboarding step is invalid')
  }
  if (!isRecord(input.data)) return invalid('step data is required')

  switch (input.step) {
    case 'business':
      return validateBusiness(input.data)
    case 'organization':
      return validateOrganization(input.data)
    case 'start_date':
      return validateStartDate(input.data, now)
    case 'home_office':
      return validateHomeOffice(input.data)
    case 'vehicles':
      return validateVehicles(input.data)
    case 'accounts':
      return validateAccounts(input.data)
    case 'starting_method':
      return validateStartingMethod(input.data)
  }
}
