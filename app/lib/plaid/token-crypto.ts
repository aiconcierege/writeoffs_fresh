import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

type Envelope = { v: 1; iv: string; tag: string; ciphertext: string }

function tokenKey() {
  const raw = process.env.PLAID_TOKEN_ENCRYPTION_KEY
  if (!raw) throw new Error('Plaid token encryption is not configured.')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('PLAID_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.')
  return key
}

export function encryptPlaidAccessToken(token: string) {
  if (!token) throw new Error('Plaid access token is required.')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', tokenKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const envelope: Envelope = {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
  return JSON.stringify(envelope)
}

export function decryptPlaidAccessToken(value: string) {
  let envelope: Envelope
  try { envelope = JSON.parse(value) as Envelope } catch { throw new Error('Stored Plaid credential is invalid.') }
  if (envelope.v !== 1) throw new Error('Stored Plaid credential uses an unsupported key version.')
  const decipher = createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
