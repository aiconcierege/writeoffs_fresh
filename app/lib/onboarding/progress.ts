import {
  BUSINESS_PROFILES, BUSINESS_STAGES, MATERIALS_HANDLING_ANSWERS,
  ONBOARDING_START_METHODS, THREE_WAY_ANSWERS,
} from './validation'

export const ONBOARDING_UI_STEPS = [
  'business', 'eligibility', 'history', 'operations', 'materials_history', 'catch_up', 'starting_method', 'review',
] as const
export type OnboardingUiStep = (typeof ONBOARDING_UI_STEPS)[number]

export type OnboardingBusinessData = {
  id: string
  name: string | null
  business_description: string | null
  business_profile_context: string | null
  schedule_c_eligibility: string | null
  business_stage: string | null
  business_start_month: string | null
  uses_customer_job_materials: string | null
  keeps_future_sale_merchandise: string | null
  prior_materials_handling: string | null
  catch_up_start_date: string | null
  onboarding_start_method: string | null
  v1_support_status: string
  v1_support_reason: string | null
  onboarding_state: string
  onboarding_version: number | null
  onboarding_completed_at: string | null
}

function oneOf(values: readonly string[], value: unknown) {
  return typeof value === 'string' && values.includes(value)
}

export function materialsHistoryRequired(business: OnboardingBusinessData) {
  return business.business_stage === 'existing' && business.uses_customer_job_materials === 'yes'
}

export function activeOnboardingSteps(business: OnboardingBusinessData): OnboardingUiStep[] {
  return ONBOARDING_UI_STEPS.filter((step) => step !== 'materials_history' || materialsHistoryRequired(business))
}

export function getFirstIncompleteOnboardingStep(business: OnboardingBusinessData, now = new Date()): OnboardingUiStep {
  if (!(business.business_description?.trim()) || !oneOf(BUSINESS_PROFILES, business.business_profile_context)) return 'business'
  if (business.schedule_c_eligibility !== 'yes') return 'eligibility'
  if (!oneOf(BUSINESS_STAGES, business.business_stage)
    || !/^\d{4}-\d{2}-01$/.test(business.business_start_month ?? '')
    || (business.business_start_month ?? '').slice(0, 7) > now.toISOString().slice(0, 7)) return 'history'
  if (!oneOf(THREE_WAY_ANSWERS, business.uses_customer_job_materials)
    || business.keeps_future_sale_merchandise !== 'no'
    || business.v1_support_status !== 'eligible') return 'operations'
  if (materialsHistoryRequired(business) && !oneOf(MATERIALS_HANDLING_ANSWERS, business.prior_materials_handling)) return 'materials_history'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(business.catch_up_start_date ?? '')
    || (business.catch_up_start_date ?? '') > now.toISOString().slice(0, 10)) return 'catch_up'
  if (!oneOf(ONBOARDING_START_METHODS, business.onboarding_start_method)) return 'starting_method'
  return 'review'
}

export function onboardingNeedsFollowUp(business: Pick<OnboardingBusinessData,
  'business_description' | 'business_profile_context' | 'schedule_c_eligibility' | 'business_stage' |
  'business_start_month' | 'uses_customer_job_materials' | 'keeps_future_sale_merchandise' |
  'prior_materials_handling' | 'catch_up_start_date' | 'onboarding_start_method' |
  'v1_support_status' | 'onboarding_state' | 'onboarding_version'>, now = new Date()) {
  return business.onboarding_state !== 'completed' || Number(business.onboarding_version ?? 0) < 3
    || getFirstIncompleteOnboardingStep({
      ...business,
      id: '',
      name: null,
      v1_support_reason: null,
      onboarding_completed_at: null,
    }, now) !== 'review'
}
