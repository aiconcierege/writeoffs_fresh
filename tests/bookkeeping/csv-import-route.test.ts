import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getAuthenticatedContext, ingestCsvFinancialActivity } = vi.hoisted(() => ({
  getAuthenticatedContext: vi.fn(),
  ingestCsvFinancialActivity: vi.fn(),
}))

vi.mock('../../app/lib/auth/require-user', async () => {
  const actual = await vi.importActual<typeof import('../../app/lib/auth/require-user')>(
    '../../app/lib/auth/require-user'
  )
  return { ...actual, getAuthenticatedContext }
})
vi.mock('../../app/lib/bookkeeping/csv-ingestion', async () => {
  const actual = await vi.importActual<typeof import('../../app/lib/bookkeeping/csv-ingestion')>(
    '../../app/lib/bookkeeping/csv-ingestion'
  )
  return { ...actual, ingestCsvFinancialActivity }
})

import { POST } from '../../app/api/import/csv/route'

function request(body: unknown) {
  return new Request('http://localhost/api/import/csv', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  pack: 'realtor',
  mapping: { date: 'Date', description: 'Description', amount: 'Amount' },
  rows: [{ Date: '2026-08-19', Description: 'Supply Shop', Amount: '-12.34' }],
}

describe('POST /api/import/csv', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ingestCsvFinancialActivity.mockResolvedValue({ imported: 1, duplicates: 0, processed: 1 })
  })

  it('rejects unauthenticated imports before canonical ingestion', async () => {
    getAuthenticatedContext.mockResolvedValue({ supabase: {}, user: null })
    const response = await POST(request(validBody))
    expect(response.status).toBe(401)
    expect(ingestCsvFinancialActivity).not.toHaveBeenCalled()
  })

  it('passes normalized factual rows through the authenticated canonical RPC path', async () => {
    const supabase = { auth: { getUser: vi.fn() } }
    getAuthenticatedContext.mockResolvedValue({ supabase, user: { id: 'user-a' } })
    const response = await POST(request(validBody))

    expect(response.status).toBe(200)
    expect(ingestCsvFinancialActivity).toHaveBeenCalledWith({
      supabase,
      rows: [expect.objectContaining({
        transactionDate: '2026-08-19',
        amountCents: -1_234,
        currency: 'USD',
        rawDescription: 'Supply Shop',
      })],
    })
    expect(await response.json()).toMatchObject({ imported: 1, duplicates: 0 })
  })

  it('does not turn the legacy pack selector into canonical classification input', async () => {
    const supabase = { auth: { getUser: vi.fn() } }
    getAuthenticatedContext.mockResolvedValue({ supabase, user: { id: 'user-a' } })
    await POST(request(validBody))
    const rows = ingestCsvFinancialActivity.mock.calls[0][0].rows
    expect(rows[0]).not.toHaveProperty('pack')
    expect(rows[0]).not.toHaveProperty('category')
    expect(rows[0]).not.toHaveProperty('treatment')
  })
})
