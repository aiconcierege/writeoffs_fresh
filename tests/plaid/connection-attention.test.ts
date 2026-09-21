import { describe, expect, it } from 'vitest'
import { bankConnectionAttention } from '../../app/lib/plaid/connection-attention'
describe('shared Home and bank connection messages', () => {
  it.each(['ITEM_LOGIN_REQUIRED','USER_PERMISSION_REVOKED'])('offers credential repair for %s', update_reason => {
    expect(bankConnectionAttention({ connection_status: 'reconnect_required', update_reason })).toEqual({message:'Your bank needs you to reconnect.',action:'Reconnect bank'})
  })
  it.each(['PENDING_EXPIRATION','PENDING_DISCONNECT'])('offers proactive renewal for %s', update_reason => {
    expect(bankConnectionAttention({ connection_status: 'needs_attention', update_reason })?.action).toBe('Renew connection')
  })
  it('offers account review only on the affected connection', () => {
    expect(bankConnectionAttention({ connection_status: 'needs_attention', new_accounts_available: true })?.action).toBe('Review accounts')
    expect(bankConnectionAttention({ connection_status: 'connected' })).toBeNull()
  })
  it('does not offer credential repair for a generic sync/account attention state', () => {
    expect(bankConnectionAttention({ connection_status: 'needs_attention' })).toBeNull()
  })
  it('does not offer repair on a disconnected Item', () => {
    expect(bankConnectionAttention({ connection_status: 'disconnected', update_reason: 'ITEM_LOGIN_REQUIRED', new_accounts_available:true })).toBeNull()
  })
})
