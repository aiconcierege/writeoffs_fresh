import {randomUUID} from 'node:crypto'
import {DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand} from '@aws-sdk/client-s3'
import {loadIndependentDeletions, sealDeletionEntry} from './independent-deletion-ledger.mjs'

const bucket = 'writeoffs-backups-264524064115-us-east-2-an'
const prefix = 'deletion-ledger/staging/entries/'

/** Never delete a known entry or send a bucket-configuration mutation. */
export async function certifyLedgerBoundaries({writer, reader, encryptionKey}) {
  const entries = await loadIndependentDeletions({client: reader, bucket, source: 'staging', encryptionKey})
  if (!entries.length) throw new Error('BOUNDARY_EXISTING_ENTRY_REQUIRED')
  const existing = entries[0]
  const existingKey = `${prefix}${existing.deletion_request_id}.wodel`
  let missingKey
  do { missingKey = `${prefix}${randomUUID()}.wodel` } while (entries.some(entry => `${prefix}${entry.deletion_request_id}.wodel` === missingKey))
  const checks = []
  const denied = async (identity, client, label, command) => {
    try { await client.send(command) }
    catch (error) {
      const denied = error?.name === 'AccessDenied' && error?.$metadata?.httpStatusCode === 403
      checks.push({identity, check: label, result: denied ? 'PASS' : 'FAIL'})
      if (!denied) throw new Error('BOUNDARY_DENIAL_NOT_PROVEN')
      return
    }
    checks.push({identity, check: label, result: 'FAIL'})
    throw new Error('BOUNDARY_UNEXPECTED_PERMISSION')
  }
  for (const [identity, client] of [['writer', writer], ['recovery-reader', reader]]) {
    await denied(identity, client, 'delete-nonexistent-key', new DeleteObjectCommand({Bucket: bucket, Key: missingKey}))
    await denied(identity, client, 'delete-nonexistent-null-version', new DeleteObjectCommand({Bucket: bucket, Key: missingKey, VersionId: 'null'}))
    if (identity === 'writer') {
      await denied(identity, client, 'delete-with-governance-bypass-request', new DeleteObjectCommand({Bucket: bucket, Key: missingKey, VersionId: 'null', BypassGovernanceRetention: true}))
      await denied(identity, client, 'list-ledger-denied', new ListObjectsV2Command({Bucket: bucket, Prefix: prefix, MaxKeys: 1}))
    }
    for (const scope of ['', 'staging/daily/', 'deletion-ledger/']) {
      await denied(identity, client, `list-outside-exact-prefix:${scope || 'bucket-root'}`, new ListObjectsV2Command({Bucket: bucket, Prefix: scope, MaxKeys: 1}))
    }
  }
  // Existing key + IfNoneMatch:* prevents any overwrite even if the reader is overprivileged.
  // A 412 response is a failure: it is not evidence of an IAM denial.
  await denied('recovery-reader', reader, 'conditional-put-existing-key-denied', new PutObjectCommand({
    Bucket: bucket, Key: existingKey, IfNoneMatch: '*', Body: sealDeletionEntry(existing, encryptionKey, 'staging'),
    ChecksumAlgorithm: 'SHA256', ContentType: 'application/octet-stream',
  }))
  const after = await loadIndependentDeletions({client: reader, bucket, source: 'staging', encryptionKey})
  if (JSON.stringify(after) !== JSON.stringify(entries)) throw new Error('BOUNDARY_LEDGER_CHANGED')
  return {result: 'PASS', checks, existingLedgerPreserved: true, bucketConfigurationMutationsAttempted: 0,
    limitations: [
      'Runtime probes establish only the listed operations, not an exhaustive IAM policy proof.',
      'A denied delete with bypass requested does not separately prove the BypassGovernanceRetention IAM action.',
      'No lifecycle, Object Lock or bucket configuration mutation was attempted. Effective-policy inspection is still required.',
    ]}
}
