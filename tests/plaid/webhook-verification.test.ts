import { createHash, generateKeyPairSync } from 'node:crypto'
import { exportJWK, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { verifyPlaidWebhook } from '../../app/lib/plaid/webhook-verification'
import type { PlaidGateway } from '../../app/lib/plaid/types'

async function signed(body: string, issuedAt = Math.floor(Date.now() / 1000)) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = await exportJWK(publicKey)
  const token = await new SignJWT({ request_body_sha256: createHash('sha256').update(body).digest('hex') })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' }).setIssuedAt(issuedAt).sign(privateKey)
  const gateway = { getWebhookVerificationKey: async () => jwk } as unknown as PlaidGateway
  return { token, gateway }
}

describe('Plaid webhook verification', () => {
  it('verifies ES256 signature, age, and exact raw-body hash', async () => {
    const body = JSON.stringify({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE' })
    const value = await signed(body)
    await expect(verifyPlaidWebhook({ rawBody: body, verification: value.token, gateway: value.gateway })).resolves.toBe(true)
    await expect(verifyPlaidWebhook({ rawBody: `${body} `, verification: value.token, gateway: value.gateway })).resolves.toBe(false)
  })

  it('rejects missing and stale verification tokens', async () => {
    const value = await signed('{}', Math.floor(Date.now() / 1000) - 600)
    await expect(verifyPlaidWebhook({ rawBody: '{}', verification: null, gateway: value.gateway })).resolves.toBe(false)
    await expect(verifyPlaidWebhook({ rawBody: '{}', verification: value.token, gateway: value.gateway })).resolves.toBe(false)
  })
})
