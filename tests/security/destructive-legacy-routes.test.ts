import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createServerSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}))

vi.mock('../../utils/supabase/server', () => ({ createServerSupabase }))

import { POST as deleteReceipt } from '../../app/api/receipts/delete/route'
import { POST as deleteTransaction } from '../../app/api/tx/delete/route'

const user = { id: 'user-1' }

function request(body: unknown) {
  return new Request('http://localhost/api/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function invalidJsonRequest() {
  return new Request('http://localhost/api/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  })
}

function unauthenticatedClient() {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
    from: vi.fn(),
    storage: { from: vi.fn() },
  }
}

function transactionClient(deleteError: { message: string } | null = null) {
  const scopeToUser = vi.fn(async () => ({ error: deleteError }))
  const scopeToId = vi.fn(() => ({ eq: scopeToUser }))
  const deleteRows = vi.fn(() => ({ eq: scopeToId }))
  const table = { delete: deleteRows }
  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
    },
    from: vi.fn((name: string) => {
      if (name !== 'transactions') throw new Error(`unexpected table: ${name}`)
      return table
    }),
  }

  return { client, deleteRows, scopeToId, scopeToUser }
}

function receiptClient({
  row = { id: 'receipt-1', storage_path: 'receipts/user-1/receipt.jpg' },
  fetchError = null,
  storageError = null,
  deleteError = null,
  canonicalLink = null,
  canonicalLinkError = null,
}: {
  row?: { id: string; storage_path: string } | null
  fetchError?: { message: string } | null
  storageError?: { message: string } | null
  deleteError?: { message: string } | null
  canonicalLink?: { id: string } | null
  canonicalLinkError?: { message: string } | null
} = {}) {
  const maybeSingle = vi.fn(async () => ({ data: row, error: fetchError }))
  const selectScopeToUser = vi.fn(() => ({ maybeSingle }))
  const selectScopeToId = vi.fn(() => ({ eq: selectScopeToUser }))
  const select = vi.fn(() => ({ eq: selectScopeToId }))

  const deleteScopeToUser = vi.fn(async () => ({ error: deleteError }))
  const deleteScopeToId = vi.fn(() => ({ eq: deleteScopeToUser }))
  const deleteRows = vi.fn(() => ({ eq: deleteScopeToId }))

  const linkMaybeSingle = vi.fn(async () => ({
    data: canonicalLink,
    error: canonicalLinkError,
  }))
  const linkLimit = vi.fn(() => ({ maybeSingle: linkMaybeSingle }))
  const linkEq = vi.fn(() => ({ limit: linkLimit }))
  const linkSelect = vi.fn(() => ({ eq: linkEq }))

  const remove = vi.fn(async () => ({ error: storageError }))
  const storageFrom = vi.fn((bucket: string) => {
    if (bucket !== 'receipts') throw new Error(`unexpected bucket: ${bucket}`)
    return { remove }
  })
  const table = { select, delete: deleteRows }
  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
    },
    from: vi.fn((name: string) => {
      if (name === 'receipts') return table
      if (name === 'bookkeeping_document_links') return { select: linkSelect }
      throw new Error(`unexpected table: ${name}`)
    }),
    storage: { from: storageFrom },
  }

  return {
    client,
    deleteRows,
    deleteScopeToId,
    deleteScopeToUser,
    maybeSingle,
    remove,
    selectScopeToId,
    selectScopeToUser,
    storageFrom,
    linkSelect,
  }
}

describe('legacy destructive API security', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ['transaction', deleteTransaction],
    ['receipt', deleteReceipt],
  ])('rejects unauthenticated %s deletion before reading or mutating data', async (_name, handler) => {
    const client = unauthenticatedClient()
    createServerSupabase.mockResolvedValue(client)

    const response = await handler(request({ id: 'record-1' }))

    expect(response.status).toBe(401)
    expect(client.from).not.toHaveBeenCalled()
    expect(client.storage.from).not.toHaveBeenCalled()
  })

  it.each([
    ['transaction', deleteTransaction],
    ['receipt', deleteReceipt],
  ])('rejects invalid JSON for %s deletion without mutating data', async (_name, handler) => {
    const context = _name === 'transaction' ? transactionClient() : receiptClient()
    createServerSupabase.mockResolvedValue(context.client)

    const response = await handler(invalidJsonRequest())

    expect(response.status).toBe(400)
    expect(context.client.from).not.toHaveBeenCalled()
  })

  it.each([
    ['transaction', deleteTransaction],
    ['receipt', deleteReceipt],
  ])('requires an id for %s deletion without mutating data', async (_name, handler) => {
    const context = _name === 'transaction' ? transactionClient() : receiptClient()
    createServerSupabase.mockResolvedValue(context.client)

    const response = await handler(request({ id: 123 }))

    expect(response.status).toBe(400)
    expect(context.client.from).not.toHaveBeenCalled()
  })

  it('scopes transaction deletion to both the record and authenticated user', async () => {
    const context = transactionClient()
    createServerSupabase.mockResolvedValue(context.client)

    const response = await deleteTransaction(request({ id: 'transaction-1' }))

    expect(response.status).toBe(200)
    expect(context.client.from).toHaveBeenCalledWith('transactions')
    expect(context.deleteRows).toHaveBeenCalledTimes(1)
    expect(context.scopeToId).toHaveBeenCalledWith('id', 'transaction-1')
    expect(context.scopeToUser).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('treats a receipt outside the authenticated tenant as not found', async () => {
    const context = receiptClient({ row: null })
    createServerSupabase.mockResolvedValue(context.client)

    const response = await deleteReceipt(request({ id: 'receipt-other-tenant' }))

    expect(response.status).toBe(404)
    expect(context.selectScopeToId).toHaveBeenCalledWith('id', 'receipt-other-tenant')
    expect(context.selectScopeToUser).toHaveBeenCalledWith('user_id', 'user-1')
    expect(context.remove).not.toHaveBeenCalled()
    expect(context.deleteRows).not.toHaveBeenCalled()
  })

  it('removes an owned receipt object before deleting its tenant-scoped row', async () => {
    const context = receiptClient()
    createServerSupabase.mockResolvedValue(context.client)

    const response = await deleteReceipt(request({ id: 'receipt-1' }))

    expect(response.status).toBe(200)
    expect(context.storageFrom).toHaveBeenCalledWith('receipts')
    expect(context.remove).toHaveBeenCalledWith(['receipts/user-1/receipt.jpg'])
    expect(context.deleteScopeToId).toHaveBeenCalledWith('id', 'receipt-1')
    expect(context.deleteScopeToUser).toHaveBeenCalledWith('user_id', 'user-1')
    expect(context.remove.mock.invocationCallOrder[0]).toBeLessThan(
      context.deleteRows.mock.invocationCallOrder[0]
    )
  })

  it('preserves canonically linked receipt evidence before storage deletion', async () => {
    const context = receiptClient({ canonicalLink: { id: 'link-1' } })
    createServerSupabase.mockResolvedValue(context.client)

    const response = await deleteReceipt(request({ id: 'receipt-1' }))

    expect(response.status).toBe(409)
    expect(context.linkSelect).toHaveBeenCalledWith('id')
    expect(context.remove).not.toHaveBeenCalled()
    expect(context.deleteRows).not.toHaveBeenCalled()
  })

  it('treats revoked canonical links as protected receipt history', async () => {
    const context = receiptClient({ canonicalLink: { id: 'revoked-link-1' } })
    createServerSupabase.mockResolvedValue(context.client)

    const response = await deleteReceipt(request({ id: 'receipt-1' }))

    expect(response.status).toBe(409)
    expect(context.remove).not.toHaveBeenCalled()
    expect(context.deleteRows).not.toHaveBeenCalled()
  })

  it('does not delete receipt metadata when storage deletion fails', async () => {
    const context = receiptClient({ storageError: { message: 'storage unavailable' } })
    createServerSupabase.mockResolvedValue(context.client)

    const response = await deleteReceipt(request({ id: 'receipt-1' }))

    expect(response.status).toBe(400)
    expect(context.deleteRows).not.toHaveBeenCalled()
  })
})
