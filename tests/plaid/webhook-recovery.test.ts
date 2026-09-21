import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ admin: vi.fn(), sync: vi.fn() }))
vi.mock('../../utils/supabase/admin', () => ({ createServerAdminSupabase: m.admin }))
vi.mock('../../app/lib/plaid/service', () => ({ syncPlaidItem: m.sync }))
vi.mock('../../app/lib/plaid/client', () => ({ createPlaidGateway: () => ({}) }))
import { processPlaidWebhookSync } from '../../app/lib/plaid/webhooks'
function fixture() {
  const query = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
    lte: vi.fn().mockResolvedValue({ error: null }) }
  m.admin.mockReturnValue({ from: () => query })
  return query
}
beforeEach(() => vi.resetAllMocks())
it('keeps inbox pending when another sync holds the Item lease', async () => {
  const query = fixture(); m.sync.mockResolvedValue({ busy: true })
  await processPlaidWebhookSync('item')
  expect(query.update).toHaveBeenCalledTimes(1)
  expect(query.update.mock.calls[0][0]).toHaveProperty('last_attempt_at')
})
it('keeps failed sync retryable without logging provider credentials', async () => {
  const query = fixture(); m.sync.mockRejectedValue(new Error('unsafe provider detail'))
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  await processPlaidWebhookSync('item')
  expect(query.update).toHaveBeenCalledTimes(1)
  expect(log).toHaveBeenCalledWith('plaid_webhook_sync_pending', { itemRecordId: 'item' })
  log.mockRestore()
})
it('completes only deliveries received before this successful sync began', async () => {
  const query = fixture(); m.sync.mockResolvedValue({ busy: false })
  await processPlaidWebhookSync('item')
  expect(query.update.mock.calls[1][0]).toHaveProperty('processed_at')
  expect(query.lte.mock.calls[0]).toEqual(query.lte.mock.calls[1])
  expect(query.eq).toHaveBeenCalledWith('webhook_code', 'SYNC_UPDATES_AVAILABLE')
})
