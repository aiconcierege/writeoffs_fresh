import {createHash, randomBytes, randomUUID} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {S3Client} from '@aws-sdk/client-s3'
import {loadIndependentDeletions, persistIndependentDeletion} from './independent-deletion-ledger.mjs'

const bucket = 'writeoffs-backups-264524064115-us-east-2-an'
const source = 'staging'
const required = (env, name) => {
  if (!env[name]) throw new Error('LEDGER_CERTIFICATION_CONFIGURATION_REQUIRED')
  return env[name]
}

/** Writes only a new synthetic tombstone; never deletes objects or changes bucket settings. */
export async function certifyLiveDeletionLedger({writer, reader, encryptionKey}) {
  const hash = () => createHash('sha256').update(`synthetic-dr:${randomUUID()}`).digest('hex')
  const entry = {
    deletion_request_id: randomUUID(), business_identity_hash: hash(), user_identity_hash: hash(),
    reason: 'customer_request', effective_at: new Date().toISOString(),
  }
  const args = {client: writer, bucket, source, encryptionKey, entry}
  const receipt = await persistIndependentDeletion(args)
  const retry = await persistIndependentDeletion(args)
  if (JSON.stringify(receipt) !== JSON.stringify(retry)) throw new Error('LEDGER_RETRY_CHANGED_VERSION')
  let conflictRejected = false
  try { await persistIndependentDeletion({...args, entry: {...entry, reason: 'retention_expired'}}) }
  catch (error) { if (error.message !== 'INDEPENDENT_DELETION_CONFLICT') throw error; conflictRejected = true }
  if (!conflictRejected) throw new Error('LEDGER_CONFLICT_ACCEPTED')
  const entries = await loadIndependentDeletions({client: reader, bucket, source, encryptionKey})
  const found = entries.filter(value => value.deletion_request_id === entry.deletion_request_id)
  if (found.length !== 1 || JSON.stringify(found[0]) !== JSON.stringify(entry)) throw new Error('LEDGER_RECOVERY_MISMATCH')
  let wrongKeyRejected = false
  const wrongKey = randomBytes(32)
  try { await loadIndependentDeletions({client: reader, bucket, source, encryptionKey: wrongKey}) }
  catch (error) { if (error.message !== 'DELETION_LEDGER_INTEGRITY_FAILED') throw error; wrongKeyRejected = true }
  finally { wrongKey.fill(0) }
  if (!wrongKeyRejected) throw new Error('LEDGER_WRONG_KEY_ACCEPTED')
  return {
    result: 'PASS', measuredAt: new Date().toISOString(), source,
    syntheticPublication: true, versionedReadback: true, idempotentRetry: true,
    conflictRejected, independentReaderVerified: true, wrongKeyRejected,
    objectsDeleted: 0, bucketConfigurationChanged: false,
    limitations: ['No hosted restore or service activation certified.', 'IAM deny permissions not actively probed.',
      'Synthetic tombstone intentionally retained outside backup expiration.'],
  }
}

async function main() {
  const env = process.env
  if (env.GITHUB_REPOSITORY !== 'aiconcierege/writeoffs_fresh' || env.GITHUB_REF !== 'refs/heads/v2-onboarding-staging' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    throw new Error('LEDGER_CERTIFICATION_RUNNER_REQUIRED')
  }
  const encoded = required(env, 'WRITEOFFS_DELETION_LEDGER_KEY_BASE64')
  const encryptionKey = Buffer.from(encoded, 'base64')
  if (encryptionKey.length !== 32 || encryptionKey.toString('base64') !== encoded) throw new Error('LEDGER_CERTIFICATION_KEY_INVALID')
  const client = (prefix) => new S3Client({region: 'us-east-2', maxAttempts: 3,
    requestHandler: {connectionTimeout: 3000, requestTimeout: 10000},
    credentials: {accessKeyId: required(env, `${prefix}_ACCESS_KEY_ID`), secretAccessKey: required(env, `${prefix}_SECRET_ACCESS_KEY`)},
  })
  let writer, reader
  try {
    writer = client('WRITEOFFS_DELETION_LEDGER')
    reader = client('WRITEOFFS_DELETION_LEDGER_RECOVERY')
    process.stdout.write(`${JSON.stringify(await certifyLiveDeletionLedger({writer, reader, encryptionKey}), null, 2)}\n`)
  } finally { writer?.destroy(); reader?.destroy(); encryptionKey.fill(0) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Provider errors can carry request context. Never emit raw errors or environment values.
    process.stdout.write(JSON.stringify({result: 'FAIL', detail: 'Ledger certification failed; no secret-bearing error details emitted.'}) + '\n')
    process.exitCode = 1
  })
}
