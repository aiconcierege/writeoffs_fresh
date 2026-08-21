import { describe, expect, it } from 'vitest'
import { validateOnboardingBusinessPatch } from '../../app/lib/onboarding/validation'

const now = new Date('2026-08-19T12:00:00Z')
const validate = (step: string, data: Record<string, unknown>) =>
  validateOnboardingBusinessPatch({ step, data }, now)

describe('canonical v1 onboarding validation', () => {
  it('accepts only plain business basics without a product profile choice', () => {
    expect(validate('business', { name: ' Smith HVAC ', business_description: ' Installs HVAC systems ' }))
      .toEqual({ ok: true, step: 'business', update: {
        name: 'Smith HVAC', business_description: 'Installs HVAC systems',
      } })
    expect(validate('business', { name: null, business_description: 'Real estate services' }).ok).toBe(true)
    expect(validate('business', { business_description: 'Trade', business_profile_context: 'general' }).ok).toBe(false)
  })

  it('accepts Schedule C facts without allowing the caller to supply derived eligibility', () => {
    expect(validate('eligibility', { schedule_c_eligibility: 'yes' })).toMatchObject({ ok: true, update: { schedule_c_eligibility: 'yes' } })
    expect(validate('eligibility', { schedule_c_eligibility: 'no' })).toMatchObject({ ok: true, update: { schedule_c_eligibility: 'no' } })
    expect(validate('eligibility', { schedule_c_eligibility: 'not_sure' })).toMatchObject({ ok: true, update: { schedule_c_eligibility: 'not_sure' } })
    expect(validate('eligibility', { schedule_c_eligibility: 'yes', v1_support_status: 'eligible' }).ok).toBe(false)
  })

  it('captures new/existing state and rejects a future start month', () => {
    expect(validate('history', { business_stage: 'existing', business_start_month: '2020-04' })).toMatchObject({ ok: true, update: { business_start_month: '2020-04-01' } })
    expect(validate('history', { business_stage: 'new', business_start_month: '2026-09' }).ok).toBe(false)
  })

  it('supports job materials while failing closed for future-sale merchandise', () => {
    expect(validate('operations', { schedule_c_eligibility: 'yes', uses_customer_job_materials: 'yes', keeps_future_sale_merchandise: 'no' })).toMatchObject({ ok: true, update: { uses_customer_job_materials: 'yes' } })
    expect(validate('operations', { schedule_c_eligibility: 'yes', uses_customer_job_materials: 'yes', keeps_future_sale_merchandise: 'yes' })).toMatchObject({ ok: true, update: { keeps_future_sale_merchandise: 'yes' } })
    expect(validate('operations', { schedule_c_eligibility: 'no', uses_customer_job_materials: 'yes', keeps_future_sale_merchandise: 'no' }).ok).toBe(false)
  })

  it('accepts factual materials history without selecting an accounting method', () => {
    for (const answer of ['deduct_purchases', 'count_year_end', 'accountant_handles', 'not_sure']) {
      expect(validate('materials_history', { prior_materials_handling: answer }).ok).toBe(true)
    }
    expect(validate('materials_history', { prior_materials_handling: 'nims' }).ok).toBe(false)
  })

  it('validates catch-up dates and only supported first-use entry points', () => {
    expect(validate('catch_up', { catch_up_start_date: '2026-01-01' }).ok).toBe(true)
    expect(validate('catch_up', { catch_up_start_date: '2026-08-20' }).ok).toBe(false)
    expect(validate('starting_method', { onboarding_start_method: 'statement_uploads' }).ok).toBe(true)
    expect(validate('starting_method', { onboarding_start_method: 'connected_financial_accounts' }).ok).toBe(false)
  })

  it('rejects caller-controlled protected and accounting fields', () => {
    for (const field of ['owner_user_id', 'business_id', 'accounting_method', 'tax_category', 'pack', 'v1_support_status']) {
      expect(validate('business', { business_description: 'Trade', [field]: 'bad' }).ok, field).toBe(false)
    }
  })
})
