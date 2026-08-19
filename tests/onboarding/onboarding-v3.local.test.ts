import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const suite = enabled ? describe : describe.skip

suite('canonical onboarding v3 against local PostgreSQL', () => {
  it('derives eligibility, synchronizes context, and enforces tenant isolation', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const ownerA = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label: 'onboarding-a', amounts: [] })
    const ownerB = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label: 'onboarding-b', amounts: [] })

    const { error: updateError } = await ownerA.customer.from('businesses').update({
      business_description: 'HVAC installation and repair', business_profile_context: 'general',
      schedule_c_eligibility: 'yes', business_stage: 'existing', business_start_month: '2020-01-01',
      uses_customer_job_materials: 'yes', keeps_future_sale_merchandise: 'no',
      prior_materials_handling: 'accountant_handles', catch_up_start_date: '2026-01-01',
      onboarding_start_method: 'statement_uploads', onboarding_state: 'in_progress', onboarding_version: 3,
    }).eq('id', ownerA.businessId)
    expect(updateError).toBeNull()

    const { data: own } = await ownerA.customer.from('businesses')
      .select('v1_support_status,v1_support_reason,uses_customer_job_materials')
      .eq('id', ownerA.businessId).single()
    expect(own).toEqual({ v1_support_status: 'eligible', v1_support_reason: null, uses_customer_job_materials: 'yes' })

    const { data: crossRead } = await ownerA.customer.from('businesses').select('id').eq('id', ownerB.businessId)
    expect(crossRead).toEqual([])
    const { data: crossWrite } = await ownerA.customer.from('businesses')
      .update({ business_description: 'cross-tenant' }).eq('id', ownerB.businessId).select('id')
    expect(crossWrite).toEqual([])

    const { error: profileError } = await ownerA.customer.from('profiles')
      .update({ vertical: 'realtor' }).eq('id', ownerA.userId)
    expect(profileError).toBeNull()
    const { data: synced } = await ownerA.customer.from('businesses')
      .select('business_profile_context').eq('id', ownerA.businessId).single()
    expect(synced?.business_profile_context).toBe('realtor')
  })

  it('prevents fabricated derived eligibility and duplicate Businesses', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label: 'onboarding-guards', amounts: [] })
    const { error: generatedError } = await owner.customer.from('businesses')
      .update({ v1_support_status: 'eligible' }).eq('id', owner.businessId)
    expect(generatedError).not.toBeNull()
    const { error: duplicateError } = await admin.from('businesses').insert({ owner_user_id: owner.userId })
    expect(duplicateError).not.toBeNull()
  })
})
