import { describe, expect, it } from 'vitest'
import { validateCompleteOnboarding } from '../../app/lib/onboarding/validation'

const complete = (overrides: Record<string, unknown> = {}) => ({
  business_description: 'HVAC installation', business_profile_context: 'general',
  schedule_c_eligibility: 'yes', business_stage: 'existing', business_start_month: '2020-01-01',
  uses_customer_job_materials: 'yes', keeps_future_sale_merchandise: 'no',
  prior_materials_handling: 'accountant_handles', catch_up_start_date: '2026-01-01',
  onboarding_start_method: 'statement_uploads', v1_support_status: 'eligible', v1_support_reason: null,
  ...overrides,
})

describe('canonical onboarding completion', () => {
  it('accepts the minimum eligible persisted state', () => {
    expect(validateCompleteOnboarding(complete(), new Date('2026-08-19T00:00:00Z')).ok).toBe(true)
  })

  it('rejects unsupported or uncertain Schedule C and merchandise states', () => {
    expect(validateCompleteOnboarding(complete({ schedule_c_eligibility: 'no', v1_support_status: 'unsupported' })).ok).toBe(false)
    expect(validateCompleteOnboarding(complete({ keeps_future_sale_merchandise: 'yes', v1_support_status: 'unsupported', v1_support_reason: 'substantial_future_sale_merchandise' })).ok).toBe(false)
  })

  it('allows trade businesses but requires factual history for existing job-material users', () => {
    expect(validateCompleteOnboarding(complete({ prior_materials_handling: null })).ok).toBe(false)
    expect(validateCompleteOnboarding(complete({ prior_materials_handling: 'not_sure' })).ok).toBe(true)
  })

  it('does not require old home-office, vehicle, account-count, legal-structure, or Pack fields', () => {
    expect(validateCompleteOnboarding(complete()).ok).toBe(true)
  })

  it('requires history to be empty when it is not applicable', () => {
    expect(validateCompleteOnboarding(complete({ business_stage: 'new', prior_materials_handling: null })).ok).toBe(true)
    expect(validateCompleteOnboarding(complete({ business_stage: 'new', prior_materials_handling: 'deduct_purchases' })).ok).toBe(false)
  })
})
