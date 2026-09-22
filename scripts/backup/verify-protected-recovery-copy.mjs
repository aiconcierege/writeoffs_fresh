import {S3Client} from '@aws-sdk/client-s3'
import {loadIndependentDeletions} from './independent-deletion-ledger.mjs'

async function main() {
  const env = process.env
  if (env.GITHUB_REPOSITORY !== 'aiconcierege/writeoffs_fresh' || env.GITHUB_REF !== 'refs/heads/v2-onboarding-staging' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw new Error('RECOVERY_RUNNER_REQUIRED')
  const encoded = env.WRITEOFFS_DELETION_LEDGER_KEY_BASE64
  if (!encoded || !env.WRITEOFFS_DELETION_LEDGER_RECOVERY_ACCESS_KEY_ID || !env.WRITEOFFS_DELETION_LEDGER_RECOVERY_SECRET_ACCESS_KEY) throw new Error('RECOVERY_CONFIGURATION_REQUIRED')
  const key = Buffer.from(encoded, 'base64')
  let client
  try {
    if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error('RECOVERY_KEY_INVALID')
    client = new S3Client({region: 'us-east-2', maxAttempts: 3, requestHandler: {connectionTimeout: 3000, requestTimeout: 10000}, credentials: {
      accessKeyId: env.WRITEOFFS_DELETION_LEDGER_RECOVERY_ACCESS_KEY_ID,
      secretAccessKey: env.WRITEOFFS_DELETION_LEDGER_RECOVERY_SECRET_ACCESS_KEY,
    }})
    const entries = await loadIndependentDeletions({client, bucket: 'writeoffs-backups-264524064115-us-east-2-an', source: 'staging', encryptionKey: key})
    if (!entries.length) throw new Error('RECOVERY_VERIFICATION_REQUIRES_EXISTING_ENTRY')
    process.stdout.write(JSON.stringify({result: 'PASS', verifiedAt: new Date().toISOString(), recoveryStore: 'GitHub environment staging-dr-recovery', existingLedgerDecrypted: true, keyRegenerated: false, writesAttempted: 0}) + '\n')
  } finally {client?.destroy(); key.fill(0)}
}
main().catch(() => {process.stderr.write('Recovery-copy verification failed; secret-bearing details suppressed.\n'); process.exitCode = 1})
