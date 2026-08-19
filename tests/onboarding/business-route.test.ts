import { beforeEach, describe, expect, it, vi } from 'vitest'
const { createServerSupabase } = vi.hoisted(() => ({ createServerSupabase: vi.fn() }))
vi.mock('../../utils/supabase/server', () => ({ createServerSupabase }))
import { PATCH } from '../../app/api/onboarding/business/route'

const request = (body: unknown) => new Request('http://localhost/api/onboarding/business', {
  method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

function client(state = 'not_started', count = 1) {
  const updates: Record<string, unknown>[] = []
  const profileUpdates: Record<string, unknown>[] = []
  const mutation = { error: null, count, eq: vi.fn(function () { return mutation }) }
  const profileMutation = { error: null, count: 1, eq: vi.fn(function () { return profileMutation }) }
  const businesses = {
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: 'b1', onboarding_state: state }, error: null })) })) })),
    update: vi.fn((value) => { updates.push(value); return mutation }),
  }
  const profiles = { update: vi.fn((value) => { profileUpdates.push(value); return profileMutation }) }
  const api = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
    from: vi.fn((name: string) => name === 'businesses' ? businesses : name === 'profiles' ? profiles : (() => { throw new Error(name) })()) }
  return { api, updates, profileUpdates, mutation, businesses }
}

describe('PATCH /api/onboarding/business', () => {
  beforeEach(() => vi.clearAllMocks())
  it('requires authentication before database access', async () => {
    const from = vi.fn(); createServerSupabase.mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user: null } })) }, from })
    expect((await PATCH(request({ step: 'eligibility', data: { schedule_c_eligibility: 'yes' } }))).status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it('resolves one Business from auth and stores server-derived eligibility', async () => {
    const c = client(); createServerSupabase.mockResolvedValue(c.api)
    expect((await PATCH(request({ step: 'operations', data: { schedule_c_eligibility: 'yes', uses_customer_job_materials: 'yes', keeps_future_sale_merchandise: 'no' } }))).status).toBe(200)
    expect(c.updates[0]).toMatchObject({ uses_customer_job_materials: 'yes', keeps_future_sale_merchandise: 'no', onboarding_version: 3 })
    expect(c.updates[0]).not.toHaveProperty('v1_support_status')
    expect(c.mutation.eq).toHaveBeenCalledWith('id', 'b1')
    expect(c.mutation.eq).toHaveBeenCalledWith('owner_user_id', 'u1')
  })

  it('updates optional profile context without creating a separate path', async () => {
    const c = client(); createServerSupabase.mockResolvedValue(c.api)
    await PATCH(request({ step: 'business', data: { name: null, business_description: 'Real estate services', business_profile_context: 'realtor' } }))
    expect(c.profileUpdates).toEqual([{ vertical: 'realtor' }])
    expect(c.updates[0]).toMatchObject({ business_profile_context: 'realtor' })
  })

  it('rejects caller-controlled ownership, eligibility, and accounting fields', async () => {
    for (const field of ['owner_user_id', 'business_id', 'accounting_method', 'v1_support_status', 'tax_category']) {
      const c = client(); createServerSupabase.mockResolvedValue(c.api)
      const response = await PATCH(request({ step: 'business', data: { business_description: 'Trade', business_profile_context: 'general', [field]: 'bad' } }))
      expect(response.status, field).toBe(400); expect(c.businesses.update).not.toHaveBeenCalled()
    }
  })

  it('fails closed if ownership-scoped update does not affect exactly one Business', async () => {
    const c = client('not_started', 0); createServerSupabase.mockResolvedValue(c.api)
    expect((await PATCH(request({ step: 'eligibility', data: { schedule_c_eligibility: 'yes' } }))).status).toBe(409)
  })
})
