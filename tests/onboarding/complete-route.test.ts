import { beforeEach, describe, expect, it, vi } from 'vitest'
const { createServerSupabase } = vi.hoisted(() => ({ createServerSupabase: vi.fn() }))
vi.mock('../../utils/supabase/server', () => ({ createServerSupabase }))
import { POST } from '../../app/api/onboarding/complete/route'

const complete = (overrides: Record<string, unknown> = {}) => ({ id: 'b1', business_description: 'Plumbing',
  business_profile_context: 'general', schedule_c_eligibility: 'yes', business_stage: 'existing',
  business_start_month: '2020-01-01', uses_customer_job_materials: 'yes', keeps_future_sale_merchandise: 'no',
  prior_materials_handling: 'accountant_handles', catch_up_start_date: '2026-01-01',
  onboarding_start_method: 'statement_uploads', v1_support_status: 'eligible', v1_support_reason: null,
  onboarding_state: 'in_progress', onboarding_version: 3, onboarding_completed_at: null, ...overrides })

function client(business = complete(), count = 1) {
  const updates: Record<string, unknown>[] = []
  const mutation = { error: null, count, eq: vi.fn(function () { return mutation }) }
  const ownerEq = vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: business, error: null })) }))
  const businesses = { select: vi.fn(() => ({ eq: ownerEq })), update: vi.fn((value) => { updates.push(value); return mutation }) }
  const destination = business.onboarding_start_method === 'receipts' ? '/receipts' : '/import'
  const rpc = vi.fn(async () => ({ data: { completedAt: business.onboarding_completed_at ?? '2026-08-19T00:00:00Z', destination }, error: null }))
  return { api: { auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
    from: vi.fn(() => businesses), rpc }, updates, mutation, businesses, ownerEq, rpc }
}

describe('POST /api/onboarding/complete', () => {
  beforeEach(() => vi.clearAllMocks())
  it('requires authentication', async () => {
    const from = vi.fn(); createServerSupabase.mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user: null } })) }, from })
    expect((await POST()).status).toBe(401); expect(from).not.toHaveBeenCalled()
  })
  it('rejects an unsupported business without marking books complete', async () => {
    const c = client(complete({ keeps_future_sale_merchandise: 'yes', v1_support_status: 'unsupported', v1_support_reason: 'substantial_future_sale_merchandise' }))
    createServerSupabase.mockResolvedValue(c.api)
    expect((await POST()).status).toBe(422); expect(c.businesses.update).not.toHaveBeenCalled()
  })
  it('sets v3 completion once and returns the selected canonical first activity', async () => {
    const c = client(); createServerSupabase.mockResolvedValue(c.api)
    const response = await POST(); expect(response.status).toBe(200)
    expect(c.rpc).toHaveBeenCalledWith('complete_business_onboarding_v3', { p_business_id: 'b1' })
    expect(await response.json()).toMatchObject({ destination: '/import' })
    const receipts = client(complete({ onboarding_start_method: 'receipts' })); createServerSupabase.mockResolvedValue(receipts.api)
    expect(await (await POST()).json()).toMatchObject({ destination: '/receipts' })
  })
  it('is idempotent after completion', async () => {
    const c = client(complete({ onboarding_state: 'completed', onboarding_completed_at: '2026-08-19T00:00:00Z' }))
    createServerSupabase.mockResolvedValue(c.api)
    expect((await POST()).status).toBe(200); expect(c.rpc).toHaveBeenCalledTimes(1)
  })
  it('cannot complete another Business because lookup and mutation use auth ownership', async () => {
    const c = client(); createServerSupabase.mockResolvedValue(c.api); await POST()
    expect(c.ownerEq).toHaveBeenCalledWith('owner_user_id', 'u1')
    expect(c.rpc).toHaveBeenCalledWith('complete_business_onboarding_v3', { p_business_id: 'b1' })
  })
})
