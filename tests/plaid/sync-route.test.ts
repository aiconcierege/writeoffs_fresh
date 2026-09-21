import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ context: vi.fn(), capability: vi.fn(), complete: vi.fn(), one: vi.fn(), all: vi.fn() }))
vi.mock('../../app/lib/auth/require-user', async original => ({ ...await original<object>(), getAuthenticatedContext: m.context }))
vi.mock('../../app/lib/membership/entitlements', async original => ({ ...await original<object>(), requireCapability: m.capability }))
vi.mock('../../app/lib/plaid/service', () => ({ completePlaidUpdate: m.complete, syncPlaidItem: m.one, syncPlaidItemsForCustomer: m.all }))
import { POST } from '../../app/api/plaid/sync/route'
beforeEach(() => { vi.resetAllMocks(); m.context.mockResolvedValue({ user: { id: 'owner' }, supabase: {} }); m.complete.mockResolvedValue(undefined); m.one.mockResolvedValue({ busy: false }); m.all.mockResolvedValue([]) })
const request = (body: object) => new Request('https://example.test/api/plaid/sync', { method: 'POST', body: JSON.stringify(body) })
it('syncs only the authorized Item after update mode', async () => {
  expect((await POST(request({ updatedItemId: 'item' }))).status).toBe(200)
  expect(m.complete).toHaveBeenCalledWith({ supabase: {}, itemRecordId: 'item' })
  expect(m.one).toHaveBeenCalledWith('item')
  expect(m.all).not.toHaveBeenCalled()
})
it('never syncs a forged or inaccessible update Item', async () => {
  m.complete.mockRejectedValue(new Error('ITEM_NOT_FOUND'))
  expect((await POST(request({ updatedItemId: 'foreign' }))).status).toBe(502)
  expect(m.one).not.toHaveBeenCalled()
  expect(m.all).not.toHaveBeenCalled()
})
it('preserves explicit customer update-all behavior', async () => {
  expect((await POST(request({}))).status).toBe(200)
  expect(m.all).toHaveBeenCalledOnce()
  expect(m.complete).not.toHaveBeenCalled()
})
