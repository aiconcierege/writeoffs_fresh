export const THREE_WAY_ANSWERS = ['yes', 'no', 'not_sure'] as const
export const BUSINESS_STAGES = ['new', 'existing'] as const
export const MATERIALS_HANDLING_ANSWERS = [
  'deduct_purchases', 'count_year_end', 'accountant_handles', 'not_sure',
] as const
export const ONBOARDING_START_METHODS = ['statement_uploads', 'receipts'] as const
export const ACCOUNTING_SENSITIVE_BUSINESS_FACTS = [
  'business_stage', 'business_start_month', 'uses_customer_job_materials',
  'keeps_future_sale_merchandise', 'prior_materials_handling',
] as const
export const ONBOARDING_BUSINESS_STEPS = [
  'business', 'eligibility', 'history', 'operations', 'materials_history', 'catch_up', 'starting_method',
] as const

export type OnboardingBusinessStep = (typeof ONBOARDING_BUSINESS_STEPS)[number]
export type OnboardingBusinessUpdate = Record<string, string | number | boolean | null>
export type ValidationResult =
  | { ok: true; step: OnboardingBusinessStep; update: OnboardingBusinessUpdate }
  | { ok: false; error: string }
export type CompleteOnboardingValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] }
export type OnboardingVehicleUpdate = {
  display_name: string; vehicle_year: number | null; make: string | null
  model: string | null; is_mixed_use: boolean
}
export type VehicleValidationResult =
  | { ok: true; update: OnboardingVehicleUpdate }
  | { ok: false; error: string }

const NAME_MAX = 200
const DESCRIPTION_MAX = 2000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === 'string' && allowed.includes(value as T[number])
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function invalid(error: string): ValidationResult { return { ok: false, error } }

// Retained for the existing Settings-compatible vehicle endpoints. Vehicles are no
// longer required by onboarding v3, but the historical API remains usable.
export function validateOnboardingVehicle(input: unknown): VehicleValidationResult {
  if (!isRecord(input) || !hasOnlyKeys(input, ['display_name', 'vehicle_year', 'make', 'model', 'is_mixed_use'])) {
    return { ok: false, error: 'vehicle contains unsupported fields' }
  }
  const displayName = typeof input.display_name === 'string' ? input.display_name.trim() : ''
  if (!displayName || displayName.length > 120) return { ok: false, error: 'display_name is required and must be 120 characters or fewer' }
  if (input.vehicle_year != null && (!Number.isInteger(input.vehicle_year) || Number(input.vehicle_year) < 1900 || Number(input.vehicle_year) > 2100)) {
    return { ok: false, error: 'vehicle_year must be a whole number from 1900 to 2100' }
  }
  if (typeof input.is_mixed_use !== 'boolean') return { ok: false, error: 'is_mixed_use is required' }
  for (const field of ['make', 'model'] as const) {
    if (input[field] != null && typeof input[field] !== 'string') return { ok: false, error: `${field} must be a string or null` }
  }
  return { ok: true, update: {
    display_name: displayName,
    vehicle_year: input.vehicle_year == null ? null : Number(input.vehicle_year),
    make: typeof input.make === 'string' ? input.make.trim() || null : null,
    model: typeof input.model === 'string' ? input.model.trim() || null : null,
    is_mixed_use: input.is_mixed_use,
  } }
}

function validateBusiness(data: Record<string, unknown>): ValidationResult {
  if (!hasOnlyKeys(data, ['name', 'business_description'])) {
    return invalid('business step contains unsupported fields')
  }
  const name = typeof data.name === 'string' ? data.name.trim() : ''
  const description = typeof data.business_description === 'string'
    ? data.business_description.trim() : ''
  if (data.name !== null && data.name !== undefined && typeof data.name !== 'string') {
    return invalid('name must be a string or null')
  }
  if (name.length > NAME_MAX) return invalid('name must be 200 characters or fewer')
  if (!description) return invalid('business_description is required')
  if (description.length > DESCRIPTION_MAX) {
    return invalid('business_description must be 2000 characters or fewer')
  }
  return { ok: true, step: 'business',
    update: { name: name || null, business_description: description } }
}

function validateEligibility(data: Record<string, unknown>): ValidationResult {
  if (!hasOnlyKeys(data, ['schedule_c_eligibility'])) return invalid('eligibility step contains unsupported fields')
  if (!isOneOf(data.schedule_c_eligibility, THREE_WAY_ANSWERS)) return invalid('schedule_c_eligibility is invalid')
  return { ok: true, step: 'eligibility', update: { schedule_c_eligibility: data.schedule_c_eligibility } }
}

function validateHistory(data: Record<string, unknown>, now: Date): ValidationResult {
  if (!hasOnlyKeys(data, ['business_stage', 'business_start_month'])) return invalid('history step contains unsupported fields')
  if (!isOneOf(data.business_stage, BUSINESS_STAGES)) return invalid('business_stage is invalid')
  if (typeof data.business_start_month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.business_start_month)) {
    return invalid('business_start_month must use YYYY-MM format')
  }
  const currentMonth = now.toISOString().slice(0, 7)
  if (data.business_start_month > currentMonth) return invalid('business_start_month cannot be later than the current month')
  return { ok: true, step: 'history', update: {
    business_stage: data.business_stage,
    business_start_month: `${data.business_start_month}-01`,
    ...(data.business_stage === 'new' ? { prior_materials_handling: null } : {}),
  } }
}

function validateOperations(data: Record<string, unknown>): ValidationResult {
  if (!hasOnlyKeys(data, ['uses_customer_job_materials', 'keeps_future_sale_merchandise', 'schedule_c_eligibility'])) {
    return invalid('operations step contains unsupported fields')
  }
  if (!isOneOf(data.uses_customer_job_materials, THREE_WAY_ANSWERS)) return invalid('uses_customer_job_materials is invalid')
  if (!isOneOf(data.keeps_future_sale_merchandise, THREE_WAY_ANSWERS)) return invalid('keeps_future_sale_merchandise is invalid')
  if (data.schedule_c_eligibility !== 'yes') return invalid('Schedule C eligibility must be established first')
  return { ok: true, step: 'operations', update: {
    uses_customer_job_materials: data.uses_customer_job_materials,
    keeps_future_sale_merchandise: data.keeps_future_sale_merchandise,
    ...(data.uses_customer_job_materials !== 'yes' ? { prior_materials_handling: null } : {}),
  } }
}

function validateMaterialsHistory(data: Record<string, unknown>): ValidationResult {
  if (!hasOnlyKeys(data, ['prior_materials_handling'])) return invalid('materials_history step contains unsupported fields')
  if (!isOneOf(data.prior_materials_handling, MATERIALS_HANDLING_ANSWERS)) return invalid('prior_materials_handling is invalid')
  return { ok: true, step: 'materials_history', update: { prior_materials_handling: data.prior_materials_handling } }
}

function validateCatchUp(data: Record<string, unknown>, now: Date): ValidationResult {
  if (!hasOnlyKeys(data, ['catch_up_start_date'])) return invalid('catch_up step contains unsupported fields')
  if (typeof data.catch_up_start_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.catch_up_start_date)) {
    return invalid('catch_up_start_date must use YYYY-MM-DD format')
  }
  const parsed = new Date(`${data.catch_up_start_date}T00:00:00Z`)
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== data.catch_up_start_date) {
    return invalid('catch_up_start_date is invalid')
  }
  if (data.catch_up_start_date > now.toISOString().slice(0, 10)) return invalid('catch_up_start_date cannot be in the future')
  return { ok: true, step: 'catch_up', update: { catch_up_start_date: data.catch_up_start_date } }
}

function validateStartingMethod(data: Record<string, unknown>): ValidationResult {
  if (!hasOnlyKeys(data, ['onboarding_start_method'])) return invalid('starting_method step contains unsupported fields')
  if (!isOneOf(data.onboarding_start_method, ONBOARDING_START_METHODS)) return invalid('onboarding_start_method is invalid')
  return { ok: true, step: 'starting_method', update: { onboarding_start_method: data.onboarding_start_method } }
}

export function validateOnboardingBusinessPatch(input: unknown, now = new Date()): ValidationResult {
  if (!isRecord(input) || !hasOnlyKeys(input, ['step', 'data'])) return invalid('request contains unsupported fields')
  if (!isOneOf(input.step, ONBOARDING_BUSINESS_STEPS)) return invalid('onboarding step is invalid')
  if (!isRecord(input.data)) return invalid('step data is required')
  switch (input.step) {
    case 'business': return validateBusiness(input.data)
    case 'eligibility': return validateEligibility(input.data)
    case 'history': return validateHistory(input.data, now)
    case 'operations': return validateOperations(input.data)
    case 'materials_history': return validateMaterialsHistory(input.data)
    case 'catch_up': return validateCatchUp(input.data, now)
    case 'starting_method': return validateStartingMethod(input.data)
  }
}

export function validateCompleteOnboarding(business: unknown, now = new Date()): CompleteOnboardingValidationResult {
  if (!isRecord(business)) return { ok: false, errors: ['business profile is unavailable'] }
  const errors: string[] = []
  const description = typeof business.business_description === 'string' ? business.business_description.trim() : ''
  if (!description || description.length > DESCRIPTION_MAX) errors.push('business description is required')
  if (business.schedule_c_eligibility !== 'yes') errors.push('Schedule C eligibility must be confirmed')
  if (!isOneOf(business.business_stage, BUSINESS_STAGES)) errors.push('business stage is required')
  if (typeof business.business_start_month !== 'string' || !/^\d{4}-\d{2}-01$/.test(business.business_start_month)
    || business.business_start_month.slice(0, 7) > now.toISOString().slice(0, 7)) errors.push('business start month is required')
  if (!isOneOf(business.uses_customer_job_materials, THREE_WAY_ANSWERS)) errors.push('customer-job materials answer is required')
  if (business.keeps_future_sale_merchandise !== 'no') errors.push('future-sale merchandise eligibility must be resolved')
  if (business.v1_support_status !== 'eligible' || business.v1_support_reason !== null) errors.push('business is not currently eligible for v1 completion')
  const needsHistory = business.business_stage === 'existing' && business.uses_customer_job_materials === 'yes'
  if (needsHistory && !isOneOf(business.prior_materials_handling, MATERIALS_HANDLING_ANSWERS)) {
    errors.push('prior materials handling is required')
  }
  if (!needsHistory && business.prior_materials_handling !== null) errors.push('prior materials handling must be empty when not applicable')
  if (typeof business.catch_up_start_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(business.catch_up_start_date)
    || business.catch_up_start_date > now.toISOString().slice(0, 10)) errors.push('catch-up start date is required')
  if (!isOneOf(business.onboarding_start_method, ONBOARDING_START_METHODS)) errors.push('starting choice is required')
  return errors.length ? { ok: false, errors } : { ok: true }
}
