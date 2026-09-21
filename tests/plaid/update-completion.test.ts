import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ admin: vi.fn(), accounts: vi.fn(), decrypt: vi.fn() }))
vi.mock('../../utils/supabase/admin', () => ({ createServerAdminSupabase: m.admin }))
vi.mock('../../app/lib/plaid/client', () => ({ createPlaidGateway: () => ({ getAccounts: m.accounts }) }))
vi.mock('../../app/lib/plaid/token-crypto', () => ({ decryptPlaidAccessToken: m.decrypt }))
import { completePlaidUpdate, syncPlaidItem } from '../../app/lib/plaid/service'
const itemId = '11111111-1111-4111-8111-111111111111'
function fixture(item: unknown = { id: itemId, access_token_ciphertext: 'encrypted' }) {
  const table = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: item }), update: vi.fn().mockReturnThis() }
  m.admin.mockReturnValue({ from: () => table })
  const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from: () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'owned-business' } }) }) }),
  }) }
  return { table, supabase: supabase as never }
}
beforeEach(() => { vi.clearAllMocks(); m.accounts.mockResolvedValue({ accounts: [], item: { error: null } }); m.decrypt.mockReturnValue('private') })
describe('Plaid update-mode completion', () => {
  it('requires the authenticated business to own the Item', async () => {
    const { table, supabase } = fixture(null)
    await expect(completePlaidUpdate({ supabase, itemRecordId: itemId })).rejects.toThrow('ITEM_NOT_FOUND')
    expect(table.eq).toHaveBeenCalledWith('business_id', 'owned-business')
    expect(m.accounts).not.toHaveBeenCalled()
    expect(table.update).not.toHaveBeenCalled()
  })
  it('does not clear consent state when provider access remains broken', async () => {
    const { table, supabase } = fixture()
    m.accounts.mockResolvedValue({ accounts: [], item: { error: { error_code: 'ITEM_LOGIN_REQUIRED' } } })
    await expect(completePlaidUpdate({ supabase, itemRecordId: itemId })).rejects.toThrow('ITEM_ACCESS_UNAVAILABLE')
    expect(table.update).not.toHaveBeenCalled()
  })
  it('clears the new-account prompt only after provider access succeeds', async () => {
    const { table, supabase } = fixture()
    await completePlaidUpdate({ supabase, itemRecordId: itemId })
    expect(table.update).toHaveBeenCalledWith({ new_accounts_available: false, consent_status: 'active' })
    expect(table.neq).toHaveBeenCalledWith('connection_status', 'disconnected')
  })
})

it('blocks background sync for a pending-deletion membership before provider access', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: [{ business_id: 'owned-business', access_token_ciphertext: 'encrypted' }], error: null })
  const table = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({
    data: { business_id: 'owned-business', plan: 'business', lifecycle: 'active', deletion_status: 'scheduled' }, error: null,
  }) }
  m.admin.mockReturnValue({ rpc, from: () => table })
  await expect(syncPlaidItem(itemId)).resolves.toMatchObject({ skipped: true })
  expect(m.accounts).not.toHaveBeenCalled()
  expect(rpc).toHaveBeenCalledWith('fail_plaid_item_sync', expect.objectContaining({ p_error_code: 'MEMBERSHIP_INACTIVE' }))
})
