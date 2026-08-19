import { describe, expect, it } from 'vitest'
import { activeOnboardingSteps, getFirstIncompleteOnboardingStep, onboardingNeedsFollowUp, type OnboardingBusinessData } from '../../app/lib/onboarding/progress'

function business(overrides: Partial<OnboardingBusinessData> = {}): OnboardingBusinessData {
  return { id: 'b1', name: null, business_description: null, business_profile_context: null,
    schedule_c_eligibility: null, business_stage: null, business_start_month: null,
    uses_customer_job_materials: null, keeps_future_sale_merchandise: null,
    prior_materials_handling: null, catch_up_start_date: null, onboarding_start_method: null,
    v1_support_status: 'needs_clarification', v1_support_reason: null,
    onboarding_state: 'not_started', onboarding_version: null, onboarding_completed_at: null,
    ...overrides }
}
const complete = business({ business_description: 'HVAC service', business_profile_context: 'general',
  schedule_c_eligibility: 'yes', business_stage: 'existing', business_start_month: '2020-01-01',
  uses_customer_job_materials: 'yes', keeps_future_sale_merchandise: 'no',
  prior_materials_handling: 'accountant_handles', catch_up_start_date: '2026-01-01',
  onboarding_start_method: 'statement_uploads', v1_support_status: 'eligible',
  onboarding_state: 'completed', onboarding_version: 3 })

describe('canonical onboarding progress', () => {
  it('resumes at the first materially incomplete persisted answer', () => {
    expect(getFirstIncompleteOnboardingStep(business())).toBe('business')
    expect(getFirstIncompleteOnboardingStep(business({ business_description: 'Trade', business_profile_context: 'general' }))).toBe('eligibility')
    expect(getFirstIncompleteOnboardingStep(complete)).toBe('review')
  })

  it('requires materials history only for an existing business that uses job materials', () => {
    expect(activeOnboardingSteps(complete)).toContain('materials_history')
    expect(activeOnboardingSteps({ ...complete, business_stage: 'new' })).not.toContain('materials_history')
    expect(activeOnboardingSteps({ ...complete, uses_customer_job_materials: 'no' })).not.toContain('materials_history')
  })

  it('does not restart fully completed v3 users and flags older completed users for minimal follow-up', () => {
    expect(onboardingNeedsFollowUp(complete)).toBe(false)
    expect(onboardingNeedsFollowUp({ ...complete, onboarding_version: 2 })).toBe(true)
    expect(onboardingNeedsFollowUp({ ...complete, uses_customer_job_materials: null })).toBe(true)
  })

  it('does not create a Realtor-specific path', () => {
    expect(activeOnboardingSteps({ ...complete, business_profile_context: 'realtor' }))
      .toEqual(activeOnboardingSteps({ ...complete, business_profile_context: 'general' }))
  })
})
