import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createServerSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}))

vi.mock('../../utils/supabase/server', () => ({ createServerSupabase }))

import { POST } from '../../app/api/onboarding/complete/route'

function completeBusiness(overrides: Record<string, unknown> = {}) {
  return {
    id: 'business-1',
    business_description: 'Independent design services',
    legal_structure: 'sole_proprietor',
    federal_tax_reporting_type: 'schedule_c',
    business_start_month: '2025-01-01',
    has_qualifying_home_office: false,
    home_office_square_feet: null,
    uses_vehicle_for_business: false,
    expected_financial_account_count: 0,
    expected_financial_account_use: null,
    onboarding_start_method: 'receipts',
    ...overrides,
  }
}

function vehicle(slot: 1 | 2) {
  return {
    slot,
    display_name: `Vehicle ${slot}`,
    vehicle_year: 2024,
    make: 'Ford',
    model: 'Transit',
    is_mixed_use: false,
  }
}

function authenticatedClient(
  business: Record<string, unknown> = completeBusiness(),
  vehicles: Array<Record<string, unknown>> = []
) {
  const ownerEq = vi.fn(() => ({
    maybeSingle: vi.fn(async () => ({ data: business, error: null })),
  }))
  const vehicleOrder = vi.fn(async () => ({ data: vehicles, error: null }))
  const vehicleArchivedIs = vi.fn(() => ({ order: vehicleOrder }))
  const vehicleBusinessEq = vi.fn(() => ({ is: vehicleArchivedIs }))
  const mutation = {
    error: null,
    count: 1,
    eq: vi.fn(function () {
      return mutation
    }),
  }
  const updates: Array<Record<string, unknown>> = []
  const businesses = {
    select: vi.fn(() => ({ eq: ownerEq })),
    update: vi.fn((value: Record<string, unknown>) => {
      updates.push(value)
      return mutation
    }),
  }
  const businessVehicles = {
    select: vi.fn(() => ({ eq: vehicleBusinessEq })),
  }
  const from = vi.fn((name: string) => {
    if (name === 'businesses') return businesses
    if (name === 'business_vehicles') return businessVehicles
    throw new Error(`unexpected table: ${name}`)
  })
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1' } },
        error: null,
      })),
    },
    from,
  }
  return { client, from, ownerEq, vehicleBusinessEq, businesses, mutation, updates }
}

describe('POST /api/onboarding/complete', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects unauthenticated requests before reading any table', async () => {
    const from = vi.fn()
    createServerSupabase.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
      from,
    })

    const response = await POST()

    expect(response.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it('returns validation errors without changing incomplete onboarding state', async () => {
    const current = authenticatedClient(completeBusiness({ legal_structure: null }))
    createServerSupabase.mockResolvedValue(current.client)

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.validation.errors).toContain('legal_structure is required')
    expect(current.businesses.update).not.toHaveBeenCalled()
  })

  it.each([[[vehicle(1)]], [[vehicle(1), vehicle(2)]]])(
    'completes with valid active vehicle records',
    async (vehicles) => {
      const current = authenticatedClient(
        completeBusiness({ uses_vehicle_for_business: true }),
        vehicles
      )
      createServerSupabase.mockResolvedValue(current.client)

      expect((await POST()).status).toBe(200)
    }
  )

  it('sets completion state, version, and a server timestamp', async () => {
    const current = authenticatedClient()
    createServerSupabase.mockResolvedValue(current.client)

    const before = Date.now()
    const response = await POST()
    const after = Date.now()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(current.updates).toEqual([
      {
        onboarding_state: 'completed',
        onboarding_version: 2,
        onboarding_completed_at: expect.any(String),
      },
    ])
    const timestamp = Date.parse(String(current.updates[0].onboarding_completed_at))
    expect(timestamp).toBeGreaterThanOrEqual(before)
    expect(timestamp).toBeLessThanOrEqual(after)
    expect(current.mutation.eq).toHaveBeenCalledWith('id', 'business-1')
    expect(current.mutation.eq).toHaveBeenCalledWith('owner_user_id', 'user-1')
    expect(body).toMatchObject({
      ok: true,
      destination: '/home',
      recommendation: { id: 'essential', informationalOnly: true },
    })
  })

  it('loads ownership and active vehicles server-side', async () => {
    const current = authenticatedClient()
    createServerSupabase.mockResolvedValue(current.client)

    await POST()

    expect(current.ownerEq).toHaveBeenCalledWith('owner_user_id', 'user-1')
    expect(current.vehicleBusinessEq).toHaveBeenCalledWith(
      'business_id',
      'business-1'
    )
  })

  it('does not branch on Realtor or industry data', async () => {
    const realtor = authenticatedClient(
      completeBusiness({ vertical: 'realtor', industry: 'realtor' })
    )
    createServerSupabase.mockResolvedValue(realtor.client)
    const realtorResponse = await POST()

    const general = authenticatedClient(
      completeBusiness({ vertical: 'general', industry: 'general' })
    )
    createServerSupabase.mockResolvedValue(general.client)
    const generalResponse = await POST()

    expect((await realtorResponse.json()).recommendation).toEqual(
      (await generalResponse.json()).recommendation
    )
  })

  it('has no vertical, industry, Stripe, Plaid, or financial side effects', async () => {
    const current = authenticatedClient()
    createServerSupabase.mockResolvedValue(current.client)

    await POST()

    expect(new Set(current.from.mock.calls.map(([name]) => name))).toEqual(
      new Set(['businesses', 'business_vehicles'])
    )
    expect(current.updates[0]).not.toHaveProperty('vertical')
    expect(current.updates[0]).not.toHaveProperty('industry')
    expect(current.updates[0]).not.toHaveProperty('plan')
    expect(current.updates[0]).not.toHaveProperty('subscription')
  })
})
