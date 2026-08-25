import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
const listCustomerQuestions = vi.fn()
const actOnCustomerQuestion = vi.fn()

vi.mock('../../utils/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null })) })) })),
    })),
  })),
}))
vi.mock('../../app/lib/bookkeeping/customer-questions', () => ({ listCustomerQuestions }))
vi.mock('../../app/lib/bookkeeping/customer-question-actions', () => ({ actOnCustomerQuestion }))
vi.mock('../../app/lib/membership/entitlements',()=>({loadCustomerEntitlements:vi.fn(async()=>({plan:'business'}))}))

const issueId = '11111111-1111-4111-8111-111111111111'
const eventId = '22222222-2222-4222-8222-222222222222'

describe('customer question API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    listCustomerQuestions.mockResolvedValue([{ id: issueId }])
    actOnCustomerQuestion.mockResolvedValue({})
  })

  it('rejects unauthenticated queue and answer access', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const queue = await import('../../app/api/bookkeeping/questions/route')
    const action = await import('../../app/api/bookkeeping/questions/[id]/route')
    expect((await queue.GET()).status).toBe(401)
    const response = await action.POST(new Request('http://local', {
      method: 'POST', headers: { 'content-type': 'application/json', 'if-match': eventId },
      body: JSON.stringify({ action: 'defer' }),
    }), { params: Promise.resolve({ id: issueId }) })
    expect(response.status).toBe(401)
    expect(actOnCustomerQuestion).not.toHaveBeenCalled()
  })

  it('returns the tenant-scoped actionable count', async () => {
    const route = await import('../../app/api/bookkeeping/questions/route')
    const response = await route.GET()
    expect(await response.json()).toEqual({ questions: [{ id: issueId }], count: 1 })
  })

  it.each([
    [{ action: 'business_use', use: 'business' }],
    [{ action: 'business_use', use: 'personal' }],
    [{ action: 'not_sure' }],
    [{ action: 'business_purpose', businessPurpose: 'Client lunch' }],
    [{ action: 'mixed_all_business' }],
    [{ action: 'mixed_personal_amount', personalAmountCents: 6600 }],
    [{ action: 'factual_choice', optionId: 'bank_amount' }],
    [{ action: 'defer' }],
  ])('accepts the narrow factual action %j', async (command) => {
    const route = await import('../../app/api/bookkeeping/questions/[id]/route')
    const response = await route.POST(new Request('http://local', {
      method: 'POST', headers: { 'content-type': 'application/json', 'if-match': eventId },
      body: JSON.stringify(command),
    }), { params: Promise.resolve({ id: issueId }) })
    expect(response.status).toBe(200)
    expect(actOnCustomerQuestion).toHaveBeenCalledWith(expect.objectContaining({
      issueId, expectedEventId: eventId, command,
    }))
  })

  it('rejects caller-supplied bookkeeping and tenant fields', async () => {
    const route = await import('../../app/api/bookkeeping/questions/[id]/route')
    const response = await route.POST(new Request('http://local', {
      method: 'POST', headers: { 'content-type': 'application/json', 'if-match': eventId },
      body: JSON.stringify({ action: 'business_use', use: 'business', businessId: 'other', category: 'meals' }),
    }), { params: Promise.resolve({ id: issueId }) })
    expect(response.status).toBe(400)
    expect(actOnCustomerQuestion).not.toHaveBeenCalled()
  })

  it('does not expose canonical database errors to the customer', async () => {
    actOnCustomerQuestion.mockRejectedValue(new Error(
      'current bookkeeping decision violated an internal allocation constraint'
    ))
    const route = await import('../../app/api/bookkeeping/questions/[id]/route')
    const response = await route.POST(new Request('http://local', {
      method: 'POST', headers: { 'content-type': 'application/json', 'if-match': eventId },
      body: JSON.stringify({ action: 'not_sure' }),
    }), { params: Promise.resolve({ id: issueId }) })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'We couldn’t save that answer. Please check it and try again.',
    })
  })
})
