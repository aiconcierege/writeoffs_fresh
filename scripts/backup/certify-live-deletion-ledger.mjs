import {createHash, randomBytes, randomUUID} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {GetObjectCommand, ListObjectsV2Command, S3Client} from '@aws-sdk/client-s3'
import {loadIndependentDeletions, persistIndependentDeletion} from './independent-deletion-ledger.mjs'
import {certifyLedgerBoundaries} from './certify-ledger-boundaries.mjs'

const bucket = 'writeoffs-backups-264524064115-us-east-2-an'
const source = 'staging'
const diagnostics = {stage: 'runner-validation'}
const safeCodes = new Set([
  'AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch', 'ExpiredToken',
  'InvalidToken', 'InvalidRequest', 'InvalidArgument', 'BadDigest', 'NoSuchBucket',
  'NoSuchKey', 'PermanentRedirect', 'AuthorizationHeaderMalformed', 'PreconditionFailed',
  'SlowDown', 'ServiceUnavailable', 'InternalError', 'TimeoutError', 'CredentialsProviderError',
  'LEDGER_CERTIFICATION_CONFIGURATION_REQUIRED', 'LEDGER_CERTIFICATION_RUNNER_REQUIRED',
  'LEDGER_CERTIFICATION_KEY_INVALID', 'INDEPENDENT_DELETION_WRITE_FAILED',
  'LEDGER_VERSION_REQUIRED', 'DELETION_LEDGER_INTEGRITY_FAILED', 'LEDGER_IDENTITY_MISMATCH',
  'INDEPENDENT_DELETION_CONFLICT', 'INCOMPLETE_LEDGER_LIST', 'DUPLICATE_LEDGER_ENTRY',
  'UNEXPECTED_LEDGER_OBJECT', 'INVALID_DELETION_ENTRY', 'LEDGER_RETRY_CHANGED_VERSION',
  'LEDGER_CONFLICT_ACCEPTED', 'LEDGER_RECOVERY_MISMATCH', 'LEDGER_WRONG_KEY_ACCEPTED',
  'BOUNDARY_EXISTING_ENTRY_REQUIRED', 'BOUNDARY_DENIAL_NOT_PROVEN', 'BOUNDARY_UNEXPECTED_PERMISSION', 'BOUNDARY_LEDGER_CHANGED',
])
export function safeFailureCode(error) {
  return [error?.message, error?.name].find(value => safeCodes.has(value)) ?? 'UNCLASSIFIED_ERROR'
}
export function credentialShape(value) {
  return {
    present: typeof value === 'string' && value.length > 0,
    expectedIamAccessKeyShape: typeof value === 'string' && /^AKIA[A-Z0-9]{16}$/.test(value),
    leadingOrTrailingWhitespace: typeof value === 'string' && value.trim() !== value,
    embeddedWhitespace: typeof value === 'string' && /\s/.test(value.trim()),
  }
}
export function signingDiagnostic(error) {
  const message = typeof error?.message === 'string' ? error.message : ''
  // Return fixed labels only. Never emit the provider's message, credential scope, or headers.
  if (/credential.*(mal.?formed|five slash|5 slash|expecting)/i.test(message)) return 'MALFORMED_CREDENTIAL_SCOPE'
  if (/region.*(wrong|expect|invalid)/i.test(message)) return 'SIGNING_REGION_MISMATCH'
  if (/date.*(wrong|expect|invalid|format)/i.test(message)) return 'SIGNING_DATE_INVALID'
  if (/authorization.*(mal.?formed|invalid)/i.test(message)) return 'MALFORMED_AUTHORIZATION_HEADER'
  return 'UNCLASSIFIED_SIGNING_DETAIL'
}
export function diagnosticClient(client, identity, state) {
  return {send: async command => {
    const name = command.constructor.name
    state.operation = ['PutObjectCommand', 'GetObjectCommand', 'ListObjectsV2Command'].includes(name) ? name : 'UNKNOWN_OPERATION'
    state.identity = identity
    delete state.providerCode
    delete state.httpStatus
    delete state.signingDetail
    try { return await client.send(command) }
    catch (error) {
      state.providerCode = safeFailureCode(error)
      if (state.providerCode === 'AuthorizationHeaderMalformed') state.signingDetail = signingDiagnostic(error)
      const status = error?.$metadata?.httpStatusCode
      if (Number.isInteger(status) && status >= 100 && status <= 599) state.httpStatus = status
      throw error
    }
  }}
}

export async function diagnoseLedgerReadOnly({writer, reader}) {
  const checks = []
  for (const [identity, client, command] of [
    ['writer', writer, new GetObjectCommand({Bucket: bucket, Key: `deletion-ledger/staging/entries/${randomUUID()}.wodel`})],
    ['recovery-reader', reader, new ListObjectsV2Command({Bucket: bucket, Prefix: 'deletion-ledger/staging/entries/', MaxKeys: 1})],
  ]) {
    const state = {}
    try {
      const result = await diagnosticClient(client, identity, state).send(command)
      result.Body?.destroy?.()
      checks.push({...state, requestSucceeded: true})
    } catch { checks.push({...state, requestSucceeded: false}) }
  }
  return {result: 'DIAGNOSTIC_ONLY', writesAttempted: 0, checks,
    note: 'Writer probe uses a nonexistent synthetic key. AccessDenied or NoSuchKey does not certify writer permissions. Reader listing returns no object names or content in this report.'}
}
const required = (env, name) => {
  if (!env[name]) throw new Error('LEDGER_CERTIFICATION_CONFIGURATION_REQUIRED')
  return env[name]
}

/** Writes only a new synthetic tombstone; never deletes objects or changes bucket settings. */
export async function certifyLiveDeletionLedger({writer, reader, encryptionKey, onStage = () => {}}) {
  const hash = () => createHash('sha256').update(`synthetic-dr:${randomUUID()}`).digest('hex')
  const entry = {
    deletion_request_id: randomUUID(), business_identity_hash: hash(), user_identity_hash: hash(),
    reason: 'customer_request', effective_at: new Date().toISOString(),
  }
  const args = {client: writer, bucket, source, encryptionKey, entry}
  onStage('synthetic-publication')
  const receipt = await persistIndependentDeletion(args)
  onStage('idempotent-retry')
  const retry = await persistIndependentDeletion(args)
  if (JSON.stringify(receipt) !== JSON.stringify(retry)) throw new Error('LEDGER_RETRY_CHANGED_VERSION')
  onStage('conflict-rejection')
  let conflictRejected = false
  try { await persistIndependentDeletion({...args, entry: {...entry, reason: 'retention_expired'}}) }
  catch (error) { if (error.message !== 'INDEPENDENT_DELETION_CONFLICT') throw error; conflictRejected = true }
  if (!conflictRejected) throw new Error('LEDGER_CONFLICT_ACCEPTED')
  onStage('recovery-reader')
  const entries = await loadIndependentDeletions({client: reader, bucket, source, encryptionKey})
  const found = entries.filter(value => value.deletion_request_id === entry.deletion_request_id)
  if (found.length !== 1 || JSON.stringify(found[0]) !== JSON.stringify(entry)) throw new Error('LEDGER_RECOVERY_MISMATCH')
  onStage('wrong-key-rejection')
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
  diagnostics.stage = 'key-validation'
  const encoded = required(env, 'WRITEOFFS_DELETION_LEDGER_KEY_BASE64')
  const encryptionKey = Buffer.from(encoded, 'base64')
  if (encryptionKey.length !== 32 || encryptionKey.toString('base64') !== encoded) throw new Error('LEDGER_CERTIFICATION_KEY_INVALID')
  const client = (prefix) => new S3Client({region: 'us-east-2', maxAttempts: 3,
    requestHandler: {connectionTimeout: 3000, requestTimeout: 10000},
    credentials: {accessKeyId: required(env, `${prefix}_ACCESS_KEY_ID`), secretAccessKey: required(env, `${prefix}_SECRET_ACCESS_KEY`)},
  })
  let writer, reader
  try {
    diagnostics.stage = 'writer-credential-validation'
    writer = client('WRITEOFFS_DELETION_LEDGER')
    diagnostics.stage = 'reader-credential-validation'
    reader = client('WRITEOFFS_DELETION_LEDGER_RECOVERY')
    if (env.WRITEOFFS_LEDGER_BOUNDARY_CERTIFICATION === 'true') {
      diagnostics.stage = 'permission-boundaries'
      const report = await certifyLedgerBoundaries({writer: diagnosticClient(writer, 'writer', diagnostics), reader: diagnosticClient(reader, 'recovery-reader', diagnostics), encryptionKey})
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      return
    }
    if (env.WRITEOFFS_LEDGER_READ_ONLY_DIAGNOSTICS === 'true') {
      const report = await diagnoseLedgerReadOnly({writer, reader})
      process.stdout.write(`${JSON.stringify({...report, configuredRegion: 'us-east-2',
        writerAccessKey: credentialShape(env.WRITEOFFS_DELETION_LEDGER_ACCESS_KEY_ID),
        readerAccessKey: credentialShape(env.WRITEOFFS_DELETION_LEDGER_RECOVERY_ACCESS_KEY_ID)}, null, 2)}\n`)
      return
    }
    process.stdout.write(`${JSON.stringify(await certifyLiveDeletionLedger({writer: diagnosticClient(writer, 'writer', diagnostics), reader: diagnosticClient(reader, 'recovery-reader', diagnostics), encryptionKey, onStage: stage => {diagnostics.stage = stage}}), null, 2)}\n`)
  } finally { writer?.destroy(); reader?.destroy(); encryptionKey.fill(0) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // Provider errors can carry request context. Never emit raw errors or environment values.
    process.stdout.write(JSON.stringify({result: 'FAIL', ...diagnostics, code: safeFailureCode(error), detail: 'Only allowlisted codes and operation metadata are emitted; raw exceptions are suppressed.'}) + '\n')
    process.exitCode = 1
  })
}
