import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { open, readFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'

const MAGIC = Buffer.from('WOBAK01')
const NONCE_BYTES = 12
const TAG_BYTES = 16

export function decodeBackupKey(value = process.env.WRITEOFFS_BACKUP_KEY_BASE64) {
  if (!value) throw new Error('WRITEOFFS_BACKUP_KEY_BASE64 is required.')
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32) throw new Error('The backup key must be exactly 32 bytes encoded as base64.')
  return key
}

export async function encryptFile(input, output, key) {
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(MAGIC)
  const handle = await open(output, 'wx', 0o600)
  await handle.write(Buffer.concat([MAGIC, nonce]))
  await handle.close()
  await pipeline(createReadStream(input), cipher, createWriteStream(output, { flags: 'a', mode: 0o600 }))
  const handleWithTag = await open(output, 'a')
  await handleWithTag.write(cipher.getAuthTag())
  await handleWithTag.close()
}

export async function decryptFile(input, output, key) {
  const payload = await readFile(input)
  const minimum = MAGIC.length + NONCE_BYTES + TAG_BYTES
  if (payload.length < minimum || !payload.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('This is not a WriteOffs encrypted backup.')
  }
  const nonceStart = MAGIC.length
  const bodyStart = nonceStart + NONCE_BYTES
  const tagStart = payload.length - TAG_BYTES
  const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(nonceStart, bodyStart))
  decipher.setAAD(MAGIC)
  decipher.setAuthTag(payload.subarray(tagStart))
  const plaintext = Buffer.concat([decipher.update(payload.subarray(bodyStart, tagStart)), decipher.final()])
  const handle = await open(output, 'wx', 0o600)
  await handle.write(plaintext)
  await handle.close()
}
