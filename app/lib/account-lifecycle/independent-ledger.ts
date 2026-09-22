import 'server-only'
import {S3Client} from '@aws-sdk/client-s3'
import {persistIndependentDeletion, type DeletionEntry} from '../../../scripts/backup/independent-deletion-ledger.mjs'

/** Separate from backup-runner credentials: this identity needs only ledger Put/Get. */
export async function publishPermanentDeletion(entry: DeletionEntry) {
  const required = (name: string) => {
    const value = process.env[name]
    if (!value) throw new Error('INDEPENDENT_LEDGER_CONFIGURATION_REQUIRED')
    return value
  }
  const source = required('WRITEOFFS_DELETION_LEDGER_SOURCE')
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  // This implementation is intentionally staged before Production authorization.
  if (source !== 'staging' || !supabaseUrl || new URL(supabaseUrl).hostname !== 'sgrqrrxrlglhjuetdtps.supabase.co') {
    throw new Error('INDEPENDENT_LEDGER_TARGET_MISMATCH')
  }
  const encodedKey = required('WRITEOFFS_DELETION_LEDGER_KEY_BASE64')
  const encryptionKey = Buffer.from(encodedKey, 'base64')
  if (encryptionKey.length !== 32 || encryptionKey.toString('base64') !== encodedKey) {
    throw new Error('INDEPENDENT_LEDGER_KEY_INVALID')
  }
  const client = new S3Client({
    region: 'us-east-2',
    maxAttempts: 3,
    requestHandler: {connectionTimeout: 3_000, requestTimeout: 10_000},
    credentials: {
      accessKeyId: required('WRITEOFFS_DELETION_LEDGER_ACCESS_KEY_ID'),
      secretAccessKey: required('WRITEOFFS_DELETION_LEDGER_SECRET_ACCESS_KEY'),
    },
  })
  try {
    return await persistIndependentDeletion({client, source, encryptionKey,
      bucket: 'writeoffs-backups-264524064115-us-east-2-an', entry})
  } finally {
    client.destroy()
    encryptionKey.fill(0)
  }
}
