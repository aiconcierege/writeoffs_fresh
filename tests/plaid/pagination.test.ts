import { expect, it, vi } from 'vitest'
import { fetchCompleteSync } from '../../app/lib/plaid/service'
import type { PlaidGateway } from '../../app/lib/plaid/types'
const page = (cursor: string, more = false) => ({ added: [], modified: [], removed: [], next_cursor: cursor, has_more: more })
const mutation = { response: { data: { error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' } } }
it('restarts from the pre-pagination cursor and discards the abandoned pages', async () => {
  const syncTransactions = vi.fn().mockResolvedValueOnce({ ...page('abandoned', true), removed: [{ transaction_id: 'abandoned' }] })
    .mockRejectedValueOnce(mutation).mockResolvedValueOnce(page('retry-page', true))
    .mockResolvedValueOnce({ ...page('committed'), removed: [{ transaction_id: 'retained' }] })
  const result = await fetchCompleteSync({ gateway: { syncTransactions } as unknown as PlaidGateway, accessToken: 'test-only', startingCursor: 'original' })
  expect(syncTransactions.mock.calls.map(c => c[1])).toEqual(['original', 'abandoned', 'original', 'retry-page'])
  expect(result.cursor).toBe('committed')
  expect(result.events.map(e => e.transaction_id)).toEqual(['retained'])
})
it('initial sync omits the cursor and returns only a fully fetched update', async () => {
  const syncTransactions = vi.fn().mockResolvedValueOnce(page('second', true)).mockResolvedValueOnce(page('final'))
  const result = await fetchCompleteSync({ gateway: { syncTransactions } as unknown as PlaidGateway, accessToken: 'test-only' })
  expect(syncTransactions.mock.calls.map(c => c[1])).toEqual([undefined, 'second'])
  expect(result.cursor).toBe('final')
})
it('does not return partial state when a later page fails', async () => {
  const syncTransactions = vi.fn().mockResolvedValueOnce(page('second', true)).mockRejectedValueOnce(new Error('network failure'))
  await expect(fetchCompleteSync({ gateway: { syncTransactions } as unknown as PlaidGateway, accessToken: 'test-only' })).rejects.toThrow('network failure')
})
it('bounds repeated pagination mutations', async () => {
  const syncTransactions = vi.fn().mockRejectedValue(mutation)
  await expect(fetchCompleteSync({ gateway: { syncTransactions } as unknown as PlaidGateway, accessToken: 'test-only', startingCursor: 'original' })).rejects.toEqual(mutation)
  expect(syncTransactions).toHaveBeenCalledTimes(3)
  expect(syncTransactions.mock.calls.map(c => c[1])).toEqual(['original', 'original', 'original'])
})
it('carries a quarantined source through complete pagination without blocking valid neighbors', async () => {
  const source = { transaction_id: 'bad', account_id: 'account', date: '2026-09-20', amount: 10.021521, iso_currency_code: 'USD' }
  const syncTransactions = vi.fn().mockResolvedValueOnce({ ...page('second', true), added: [source] })
    .mockResolvedValueOnce({ ...page('final'), added: [{ ...source, transaction_id: 'good', amount: 12.34 }] })
  const result = await fetchCompleteSync({ gateway: { syncTransactions } as unknown as PlaidGateway, accessToken: 'test-only', startingCursor: 'original' })
  expect(result.cursor).toBe('final')
  expect(result.events[0]).toMatchObject({ transaction_id: 'bad', amount_cents: null, rejection_reason: 'INVALID_SOURCE_FACTS', raw_source: source })
  expect(result.events[1]).toMatchObject({ transaction_id: 'good', amount_cents: -1234 })
})
