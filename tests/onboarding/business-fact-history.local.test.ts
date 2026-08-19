import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const suite = enabled ? describe : describe.skip

suite('append-only Business fact history against local PostgreSQL', () => {
  it('atomically records current state, history, corrections, and semantic retries', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label: 'business-facts', amounts: [] })
    const firstKey = crypto.randomUUID()
    const input = { p_business_id: owner.businessId,
      p_changes: { business_stage: 'existing', business_start_month: '2020-01-01',
        uses_customer_job_materials: 'yes', keeps_future_sale_merchandise: 'no',
        prior_materials_handling: 'accountant_handles' }, p_expected_event_ids: {},
      p_source: 'onboarding', p_reason: 'Customer answered setup.', p_request_key: firstKey }
    const [first, retry] = await Promise.all([
      owner.customer.rpc('record_business_fact_changes', input),
      owner.customer.rpc('record_business_fact_changes', input),
    ])
    expect(first.error).toBeNull(); expect(retry.error).toBeNull()
    expect(first.data).toEqual(retry.data)
    const { data: state } = await owner.customer.from('businesses')
      .select('business_stage,business_start_month,uses_customer_job_materials,keeps_future_sale_merchandise,prior_materials_handling')
      .eq('id', owner.businessId).single()
    expect(state).toMatchObject({ business_stage: 'existing', business_start_month: '2020-01-01',
      uses_customer_job_materials: 'yes', keeps_future_sale_merchandise: 'no', prior_materials_handling: 'accountant_handles' })
    const { data: initialHistory } = await owner.customer.from('business_fact_events')
      .select('id,fact_key,fact_value,supersedes_event_id,actor_user_id,provenance')
      .eq('business_id', owner.businessId)
    expect(initialHistory).toHaveLength(5)
    expect(initialHistory!.every((event) => event.actor_user_id === owner.userId && event.provenance === 'user')).toBe(true)

    const currentMaterials = initialHistory!.find((event) => event.fact_key === 'uses_customer_job_materials')!
    const correction = await owner.customer.rpc('record_business_fact_changes', {
      p_business_id: owner.businessId, p_changes: { uses_customer_job_materials: 'no', prior_materials_handling: null },
      p_expected_event_ids: { uses_customer_job_materials: currentMaterials.id,
        prior_materials_handling: initialHistory!.find((event) => event.fact_key === 'prior_materials_handling')!.id },
      p_source: 'settings', p_reason: 'Customer corrected setup.', p_request_key: crypto.randomUUID(),
    })
    expect(correction.error).toBeNull()
    const { data: history } = await owner.customer.from('business_fact_events')
      .select('id,fact_key,fact_value,supersedes_event_id').eq('business_id', owner.businessId)
    expect(history).toHaveLength(7)
    expect(history!.find((event) => event.fact_key === 'uses_customer_job_materials'
      && event.fact_value === 'no')?.supersedes_event_id).toBe(currentMaterials.id)
  })

  it('rejects stale, cross-tenant, direct mutation, and forged history', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const a = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label: 'business-fact-a', amounts: [] })
    const b = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label: 'business-fact-b', amounts: [] })
    const first = await a.customer.rpc('record_business_fact_changes', { p_business_id: a.businessId,
      p_changes: { business_stage: 'new', business_start_month: '2026-01-01' }, p_expected_event_ids: {},
      p_source: 'onboarding', p_reason: 'Initial answer.', p_request_key: crypto.randomUUID() })
    expect(first.error).toBeNull()
    const stale = await a.customer.rpc('record_business_fact_changes', { p_business_id: a.businessId,
      p_changes: { business_stage: 'existing' }, p_expected_event_ids: { business_stage: null },
      p_source: 'settings', p_reason: 'Stale answer.', p_request_key: crypto.randomUUID() })
    expect(stale.error?.message).toMatch(/changed before this answer/i)
    const cross = await a.customer.rpc('record_business_fact_changes', { p_business_id: b.businessId,
      p_changes: { business_stage: 'new' }, p_expected_event_ids: {}, p_source: 'settings',
      p_reason: 'Cross tenant.', p_request_key: crypto.randomUUID() })
    expect(cross.error).not.toBeNull()
    const { error: directCache } = await a.customer.from('businesses')
      .update({ business_stage: 'existing' }).eq('id', a.businessId)
    expect(directCache).not.toBeNull()
    const { error: forged } = await a.customer.from('business_fact_events').insert({
      business_id: a.businessId, fact_key: 'business_stage', fact_value: 'existing',
      actor_user_id: a.userId, provenance: 'user', source: 'settings', reason: 'Forged.', request_key: 'forged',
    })
    expect(forged).not.toBeNull()
    const { data: crossRead } = await a.customer.from('business_fact_events').select('id').eq('business_id', b.businessId)
    expect(crossRead).toEqual([])
    const { data: ownHistory } = await a.customer.from('business_fact_events')
      .select('id').eq('business_id', a.businessId)
    const { error: mutation } = await admin.from('business_fact_events')
      .update({ reason: 'Rewritten.' }).eq('id', ownHistory![0].id)
    expect(mutation).not.toBeNull()
  })

  it('serializes completion with retries and a concurrent eligibility-changing correction', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label: 'business-completion', amounts: [] })
    const { error: ordinaryError } = await owner.customer.from('businesses').update({
      business_description: 'Trade services', business_profile_context: 'general', schedule_c_eligibility: 'yes',
      catch_up_start_date: '2026-01-01', onboarding_start_method: 'statement_uploads', onboarding_version: 3,
    }).eq('id', owner.businessId)
    expect(ordinaryError).toBeNull()
    const facts = await owner.customer.rpc('record_business_fact_changes', { p_business_id: owner.businessId,
      p_changes: { business_stage: 'new', business_start_month: '2026-01-01',
        uses_customer_job_materials: 'no', keeps_future_sale_merchandise: 'no' }, p_expected_event_ids: {},
      p_source: 'onboarding', p_reason: 'Initial complete facts.', p_request_key: crypto.randomUUID() })
    expect(facts.error).toBeNull()
    const [completionA, completionB] = await Promise.all([
      owner.customer.rpc('complete_business_onboarding_v3', { p_business_id: owner.businessId }),
      owner.customer.rpc('complete_business_onboarding_v3', { p_business_id: owner.businessId }),
    ])
    expect(completionA.error).toBeNull(); expect(completionB.error).toBeNull()
    expect(completionA.data).toEqual(completionB.data)

    const [correction, racedCompletion] = await Promise.all([
      owner.customer.rpc('record_business_fact_changes', { p_business_id: owner.businessId,
        p_changes: { keeps_future_sale_merchandise: 'yes' },
        p_expected_event_ids: { keeps_future_sale_merchandise: facts.data.keeps_future_sale_merchandise },
        p_source: 'settings', p_reason: 'Corrected eligibility fact.', p_request_key: crypto.randomUUID() }),
      owner.customer.rpc('complete_business_onboarding_v3', { p_business_id: owner.businessId }),
    ])
    expect(correction.error).toBeNull()
    expect(racedCompletion.error === null || racedCompletion.error.message.includes('onboarding is incomplete')).toBe(true)
    const { data: finalState } = await owner.customer.from('businesses')
      .select('onboarding_state,v1_support_status').eq('id', owner.businessId).single()
    expect(finalState).toEqual({ onboarding_state: 'in_progress', v1_support_status: 'unsupported' })
  })
})
