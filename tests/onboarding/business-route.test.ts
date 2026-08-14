import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createServerSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}))

vi.mock('../../utils/supabase/server', () => ({ createServerSupabase }))

import { PATCH } from '../../app/api/onboarding/business/route'

type BusinessState = 'not_started' | 'in_progress' | 'completed'

function request(body: unknown) {
  return new Request('http://localhost/api/onboarding/business', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function authenticatedClient(state: BusinessState = 'not_started') {
  const updates: Array<Record<string, unknown>> = []
  const updateResult = {
    error: null,
    count: 1,
    eq: vi.fn(function () {
      return updateResult
    }),
  }
  const table = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: { id: 'business-1', onboarding_state: state },
          error: null,
        })),
      })),
    })),
    update: vi.fn((value: Record<string, unknown>) => {
      updates.push(value)
      return updateResult
    }),
  }
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1' } },
        error: null,
      })),
    },
    from: vi.fn((name: string) => {
      if (name !== 'businesses') throw new Error(`unexpected table: ${name}`)
      return table
    }),
  }
  return { client, updates, table, updateResult }
}

describe('PATCH /api/onboarding/business', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an unauthenticated request before reading or writing tables', async () => {
    const from = vi.fn()
    createServerSupabase.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
      from,
    })

    const response = await PATCH(request({ step: 'vehicles', data: { uses_vehicle_for_business: true } }))

    expect(response.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it('resolves the Business from the authenticated user and sets v2 progress state', async () => {
    const context = authenticatedClient()
    createServerSupabase.mockResolvedValue(context.client)

    const response = await PATCH(
      request({ step: 'business', data: { name: '  ', business_description: ' Consulting ' } })
    )

    expect(response.status).toBe(200)
    expect(context.updates).toEqual([
      {
        name: null,
        business_description: 'Consulting',
        onboarding_state: 'in_progress',
        onboarding_version: 2,
      },
    ])
    expect(context.updateResult.eq).toHaveBeenNthCalledWith(1, 'id', 'business-1')
    expect(context.updateResult.eq).toHaveBeenNthCalledWith(2, 'owner_user_id', 'user-1')
  })

  it('preserves completed state while applying a later save', async () => {
    const context = authenticatedClient('completed')
    createServerSupabase.mockResolvedValue(context.client)

    const response = await PATCH(
      request({ step: 'vehicles', data: { uses_vehicle_for_business: false } })
    )

    expect(response.status).toBe(200)
    expect(context.updates[0]).toMatchObject({
      uses_vehicle_for_business: false,
      onboarding_state: 'completed',
      onboarding_version: 2,
    })
  })

  it('atomically clears home-office square feet when the answer is false', async () => {
    const context = authenticatedClient()
    createServerSupabase.mockResolvedValue(context.client)

    await PATCH(
      request({
        step: 'home_office',
        data: { has_qualifying_home_office: false, home_office_square_feet: 500 },
      })
    )

    expect(context.updates[0]).toMatchObject({
      has_qualifying_home_office: false,
      home_office_square_feet: null,
    })
  })

  it('atomically clears expected account use when account count is zero', async () => {
    const context = authenticatedClient()
    createServerSupabase.mockResolvedValue(context.client)

    await PATCH(
      request({
        step: 'accounts',
        data: {
          expected_financial_account_count: 0,
          expected_financial_account_use: 'mixed_use',
        },
      })
    )

    expect(context.updates[0]).toMatchObject({
      expected_financial_account_count: 0,
      expected_financial_account_use: null,
    })
  })

  it('rejects protected or unrelated fields without performing an update', async () => {
    const protectedFields = [
      'vertical',
      'industry',
      'entity_type',
      'owner_user_id',
      'accounting_method',
      'financial_accounts',
      'financial_transactions',
    ]

    for (const field of protectedFields) {
      const context = authenticatedClient()
      createServerSupabase.mockResolvedValue(context.client)
      const response = await PATCH(
        request({
          step: 'business',
          data: { business_description: 'Consulting', [field]: 'forbidden' },
        })
      )
      expect(response.status, field).toBe(400)
      expect(context.table.update, field).not.toHaveBeenCalled()
    }
  })

  it('has no Plaid, Stripe, vehicle, or financial-record side effects', async () => {
    const context = authenticatedClient()
    createServerSupabase.mockResolvedValue(context.client)

    await PATCH(
      request({ step: 'vehicles', data: { uses_vehicle_for_business: true } })
    )

    expect(context.client.from).toHaveBeenCalledTimes(2)
    expect(context.client.from).toHaveBeenCalledWith('businesses')
    expect(context.updates[0]).not.toHaveProperty('vertical')
    expect(context.updates[0]).not.toHaveProperty('industry')
  })
})
