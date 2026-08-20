import { describe, expect, it } from 'vitest'
import { newItemLinkRequest, updateModeLinkRequest } from '../../app/lib/plaid/client'

describe('Plaid Link request contract', () => {
  it('requests only Transactions for US new-Item Link', () => {
    const request = newItemLinkRequest({
      clientUserId: 'stable-hash', webhook: 'https://example.test/api/plaid/webhook',
      redirectUri: 'https://example.test/settings/banking',
    })
    expect(request).toMatchObject({
      client_name: 'WriteOffs', language: 'en', country_codes: ['US'],
      products: ['transactions'], user: { client_user_id: 'stable-hash' },
      account_filters: {
        depository: { account_subtypes: ['checking', 'savings'] },
        credit: { account_subtypes: ['credit card'] },
      },
    })
    expect(JSON.stringify(request)).not.toMatch(/auth|identity|balance|transfer|income|liabilit|investment/i)
  })

  it('uses the existing credential in update mode without adding products', () => {
    const request = updateModeLinkRequest({ clientUserId: 'stable-hash', accessToken: 'server-secret' })
    expect(request.access_token).toBe('server-secret')
    expect(request).not.toHaveProperty('products')
  })
})
