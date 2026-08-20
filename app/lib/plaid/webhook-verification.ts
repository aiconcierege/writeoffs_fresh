import { createHash, timingSafeEqual } from 'node:crypto'
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify, type JWK } from 'jose'
import type { PlaidGateway } from './types'

export async function verifyPlaidWebhook(input: {
  rawBody: string
  verification: string | null
  gateway: PlaidGateway
  now?: number
}) {
  if (!input.verification) return false
  let header: ReturnType<typeof decodeProtectedHeader>
  try { header = decodeProtectedHeader(input.verification) } catch { return false }
  if (header.alg !== 'ES256' || typeof header.kid !== 'string') return false
  try {
    const jwk = await input.gateway.getWebhookVerificationKey(header.kid)
    const key = await importJWK(jwk as JWK, 'ES256')
    await jwtVerify(input.verification, key, { algorithms: ['ES256'], maxTokenAge: '5 min' })
    const payload = decodeJwt(input.verification)
    if (typeof payload.iat !== 'number' || Math.abs((input.now ?? Date.now()) / 1000 - payload.iat) > 300) return false
    if (typeof payload.request_body_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(payload.request_body_sha256)) return false
    const actual = Buffer.from(createHash('sha256').update(input.rawBody).digest('hex'))
    const expected = Buffer.from(payload.request_body_sha256)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch { return false }
}
