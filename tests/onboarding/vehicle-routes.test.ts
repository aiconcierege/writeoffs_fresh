import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createServerSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}))

vi.mock('../../utils/supabase/server', () => ({ createServerSupabase }))

import { PUT } from '../../app/api/onboarding/vehicles/[slot]/route'
import { PATCH as ARCHIVE } from '../../app/api/onboarding/vehicles/[slot]/archive/route'

function vehicleRequest(body: unknown) {
  return new Request('http://localhost/api/onboarding/vehicles/1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function context(slot: string) {
  return { params: Promise.resolve({ slot }) }
}

const validVehicle = {
  display_name: 'Work car',
  vehicle_year: 2022,
  make: 'Toyota',
  model: 'Camry',
  is_mixed_use: true,
}

function authenticatedClient(options?: {
  activeVehicleId?: string | null
  mutationCount?: number
}) {
  const activeVehicleId = options?.activeVehicleId ?? null
  const mutationCount = options?.mutationCount ?? 1
  const businessOwnerEq = vi.fn(() => ({
    maybeSingle: vi.fn(async () => ({
      data: { id: 'business-1' },
      error: null,
    })),
  }))
  const vehicleArchivedIs = vi.fn(() => ({
    maybeSingle: vi.fn(async () => ({
      data: activeVehicleId ? { id: activeVehicleId } : null,
      error: null,
    })),
  }))
  const vehicleSlotEq = vi.fn(() => ({ is: vehicleArchivedIs }))
  const vehicleBusinessEq = vi.fn(() => ({ eq: vehicleSlotEq }))

  const mutation = {
    error: null,
    count: mutationCount,
    eq: vi.fn(function () {
      return mutation
    }),
    is: vi.fn(function () {
      return mutation
    }),
  }
  const updates: Array<Record<string, unknown>> = []
  const inserts: Array<Record<string, unknown>> = []
  const businessTable = {
    select: vi.fn(() => ({ eq: businessOwnerEq })),
  }
  const vehicleTable = {
    select: vi.fn(() => ({ eq: vehicleBusinessEq })),
    update: vi.fn((value: Record<string, unknown>) => {
      updates.push(value)
      return mutation
    }),
    insert: vi.fn(async (value: Record<string, unknown>) => {
      inserts.push(value)
      return { error: null, count: mutationCount }
    }),
  }
  const from = vi.fn((name: string) => {
    if (name === 'businesses') return businessTable
    if (name === 'business_vehicles') return vehicleTable
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

  return {
    client,
    from,
    businessOwnerEq,
    vehicleBusinessEq,
    vehicleSlotEq,
    vehicleArchivedIs,
    vehicleTable,
    mutation,
    updates,
    inserts,
  }
}

describe('v2 onboarding vehicle routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects unauthenticated PUT and archive requests', async () => {
    const from = vi.fn()
    createServerSupabase.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
      from,
    })

    expect((await PUT(vehicleRequest(validVehicle), context('1'))).status).toBe(401)
    expect(
      (await ARCHIVE(new Request('http://localhost'), context('1'))).status
    ).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects invalid and third slots before resolving a Business', async () => {
    for (const slot of ['0', '3', '01', 'other']) {
      const current = authenticatedClient()
      createServerSupabase.mockResolvedValue(current.client)
      expect((await PUT(vehicleRequest(validVehicle), context(slot))).status).toBe(400)
      expect(current.from, slot).not.toHaveBeenCalled()
    }
  })

  it.each(['1', '2'])('creates a new active vehicle in slot %s', async (slot) => {
    const current = authenticatedClient()
    createServerSupabase.mockResolvedValue(current.client)

    const response = await PUT(vehicleRequest(validVehicle), context(slot))

    expect(response.status).toBe(201)
    expect(current.inserts).toEqual([
      { business_id: 'business-1', slot: Number(slot), ...validVehicle },
    ])
  })

  it('updates an existing active vehicle without changing identity', async () => {
    const current = authenticatedClient({ activeVehicleId: 'vehicle-1' })
    createServerSupabase.mockResolvedValue(current.client)

    const response = await PUT(vehicleRequest(validVehicle), context('1'))

    expect(response.status).toBe(200)
    expect(current.updates).toEqual([validVehicle])
    expect(current.inserts).toHaveLength(0)
    expect(current.mutation.eq).toHaveBeenCalledWith('id', 'vehicle-1')
    expect(current.mutation.eq).toHaveBeenCalledWith('business_id', 'business-1')
    expect(current.mutation.is).toHaveBeenCalledWith('archived_at', null)
  })

  it('creates a new record when no active vehicle occupies an archived slot', async () => {
    const current = authenticatedClient({ activeVehicleId: null })
    createServerSupabase.mockResolvedValue(current.client)

    await PUT(vehicleRequest(validVehicle), context('1'))

    expect(current.vehicleTable.update).not.toHaveBeenCalled()
    expect(current.inserts).toHaveLength(1)
    expect(current.inserts[0]).not.toHaveProperty('id')
    expect(current.inserts[0]).not.toHaveProperty('archived_at')
  })

  it('resolves ownership server-side and rejects client business_id', async () => {
    const rejected = authenticatedClient()
    createServerSupabase.mockResolvedValue(rejected.client)
    const response = await PUT(
      vehicleRequest({ ...validVehicle, business_id: 'business-2' }),
      context('1')
    )
    expect(response.status).toBe(400)
    expect(rejected.from).not.toHaveBeenCalled()

    const accepted = authenticatedClient()
    createServerSupabase.mockResolvedValue(accepted.client)
    await PUT(vehicleRequest(validVehicle), context('1'))
    expect(accepted.businessOwnerEq).toHaveBeenCalledWith('owner_user_id', 'user-1')
    expect(accepted.vehicleBusinessEq).toHaveBeenCalledWith(
      'business_id',
      'business-1'
    )
  })

  it('archives an active vehicle without deleting or changing identity', async () => {
    const current = authenticatedClient({ mutationCount: 1 })
    createServerSupabase.mockResolvedValue(current.client)

    const response = await ARCHIVE(
      new Request('http://localhost/api/onboarding/vehicles/1/archive'),
      context('1')
    )
    const body = await response.json()

    expect(body).toMatchObject({ ok: true, slot: 1, archived: true })
    expect(current.updates).toHaveLength(1)
    expect(current.updates[0]).toEqual({ archived_at: expect.any(String) })
    expect(current.mutation.eq).toHaveBeenCalledWith('business_id', 'business-1')
    expect(current.mutation.eq).toHaveBeenCalledWith('slot', 1)
    expect(current.mutation.is).toHaveBeenCalledWith('archived_at', null)
    expect(current.vehicleTable).not.toHaveProperty('delete')
  })

  it('returns an idempotent result when the slot has no active vehicle', async () => {
    const current = authenticatedClient({ mutationCount: 0 })
    createServerSupabase.mockResolvedValue(current.client)

    const response = await ARCHIVE(
      new Request('http://localhost/api/onboarding/vehicles/2/archive'),
      context('2')
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, archived: false })
  })

  it('touches only Businesses and Business vehicles with no unrelated side effects', async () => {
    const current = authenticatedClient()
    createServerSupabase.mockResolvedValue(current.client)

    await PUT(vehicleRequest(validVehicle), context('1'))

    expect(new Set(current.from.mock.calls.map(([name]) => name))).toEqual(
      new Set(['businesses', 'business_vehicles'])
    )
    for (const value of [...current.updates, ...current.inserts]) {
      expect(value).not.toHaveProperty('vertical')
      expect(value).not.toHaveProperty('industry')
      expect(value).not.toHaveProperty('onboarding_state')
      expect(value).not.toHaveProperty('onboarding_version')
    }
  })
})
