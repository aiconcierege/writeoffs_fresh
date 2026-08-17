import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createServerSupabase, attachReceiptToFinancialTransaction } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  attachReceiptToFinancialTransaction: vi.fn(),
}))

vi.mock('../../utils/supabase/server', () => ({ createServerSupabase }))
vi.mock('../../app/lib/bookkeeping/receipt-matching-workflow', () => ({
  attachReceiptToFinancialTransaction,
}))

import { POST } from '../../app/api/bookkeeping/financial-transactions/[id]/receipts/route'

const transactionId = '43000000-0000-4000-8000-000000000001'
const receiptId = '53000000-0000-4000-8000-000000000001'

function request(body: unknown) {
  return new Request('http://localhost/api/bookkeeping/match', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function context(id = transactionId) {
  return { params: Promise.resolve({ id }) }
}

describe('canonical receipt matching route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    attachReceiptToFinancialTransaction.mockResolvedValue({
      record: { id: 'record-1' },
      link: { id: 'link-1' },
    })
  })

  it('rejects unauthenticated requests before matching', async () => {
    createServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    })
    const response = await POST(request({ receipt_id: receiptId }), context())
    expect(response.status).toBe(401)
    expect(attachReceiptToFinancialTransaction).not.toHaveBeenCalled()
  })

  it('rejects malformed transaction and receipt ids', async () => {
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    }
    createServerSupabase.mockResolvedValue(client)
    expect((await POST(request({ receipt_id: 'bad' }), context())).status).toBe(400)
    expect((await POST(request({ receipt_id: receiptId }), context('bad'))).status).toBe(400)
    expect(attachReceiptToFinancialTransaction).not.toHaveBeenCalled()
  })

  it('uses only the authenticated client and route/body ids', async () => {
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    }
    createServerSupabase.mockResolvedValue(client)
    const response = await POST(
      request({ receipt_id: receiptId, business_id: 'ignored', user_id: 'ignored' }),
      context()
    )
    expect(response.status).toBe(200)
    expect(attachReceiptToFinancialTransaction).toHaveBeenCalledWith({
      supabase: client,
      financialTransactionId: transactionId,
      receiptId,
    })
    expect(await response.json()).toEqual({
      ok: true,
      bookkeeping_record_id: 'record-1',
      document_link_id: 'link-1',
    })
  })

  it('returns tenant lookup failures without creating an alternate path', async () => {
    createServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    })
    attachReceiptToFinancialTransaction.mockRejectedValue(
      new Error('Receipt was not found for this Business.')
    )
    const response = await POST(request({ receipt_id: receiptId }), context())
    expect(response.status).toBe(404)
  })
})
