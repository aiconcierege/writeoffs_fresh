import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ verify: vi.fn(), record: vi.fn(), sync: vi.fn(), after: vi.fn() }))
vi.mock('next/server', async original => ({ ...await original<object>(), after: m.after }))
vi.mock('../../app/lib/plaid/webhooks', () => ({ verifyPlaidWebhook: m.verify, recordPlaidWebhook: m.record, processPlaidWebhookSync: m.sync }))
import { POST } from '../../app/api/plaid/webhook/route'
const request = () => new Request('https://example.test/api/plaid/webhook', { method: 'POST', headers: { 'plaid-verification': 'signed' }, body: '{}' })
beforeEach(() => { vi.clearAllMocks(); m.verify.mockResolvedValue(true); m.record.mockResolvedValue({ itemId: 'item', shouldSync: false }) })
describe('Plaid public receiver', () => {
  it('rejects unsigned/tampered delivery before touching tenant state', async () => {
    m.verify.mockResolvedValue(false)
    expect((await POST(request())).status).toBe(401)
    expect(m.record).not.toHaveBeenCalled()
  })
  it('acknowledges Item notifications without scheduling Transactions', async () => {
    expect((await POST(request())).status).toBe(200)
    expect(m.after).not.toHaveBeenCalled()
  })
  it('responds before a transaction sync executes', async () => {
    m.record.mockResolvedValue({ itemId: 'item', shouldSync: true })
    expect((await POST(request())).status).toBe(200)
    expect(m.sync).not.toHaveBeenCalled()
    await m.after.mock.calls[0][0]()
    expect(m.sync).toHaveBeenCalledWith('item')
  })
  it('asks Plaid to retry storage failures, instead of reporting success', async () => {
    m.record.mockRejectedValue(new Error('WEBHOOK_RECORD_FAILED'))
    expect((await POST(request())).status).toBe(503)
    expect(m.after).not.toHaveBeenCalled()
  })
  it('rejects malformed signed payloads', async () => {
    m.record.mockRejectedValue(new Error('INVALID_WEBHOOK'))
    expect((await POST(request())).status).toBe(400)
  })
})
