import {spawnSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'

const repo = 'aiconcierege/writeoffs_fresh'
const destination = 'staging-dr-recovery'
const names = [
  'WRITEOFFS_DELETION_LEDGER_KEY_BASE64',
  'WRITEOFFS_DELETION_LEDGER_RECOVERY_ACCESS_KEY_ID',
  'WRITEOFFS_DELETION_LEDGER_RECOVERY_SECRET_ACCESS_KEY',
]

/** Fixed destination, no secret arguments/files/logs, no overwrite, no credential creation. */
export function copyProtectedRecoverySecrets({env, run = spawnSync}) {
  if (env.GITHUB_REPOSITORY !== repo || env.GITHUB_REF !== 'refs/heads/v2-onboarding-staging' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw new Error('RECOVERY_COPY_RUNNER_REQUIRED')
  if (!env.WRITEOFFS_RECOVERY_BOOTSTRAP_TOKEN) throw new Error('RECOVERY_COPY_AUTH_REQUIRED')
  if (!env.GITHUB_TOKEN) throw new Error('RECOVERY_COPY_INSPECTION_AUTH_REQUIRED')
  const childEnv = {PATH: env.PATH, HOME: env.HOME, GH_TOKEN: env.WRITEOFFS_RECOVERY_BOOTSTRAP_TOKEN, GH_PROMPT_DISABLED: '1'}
  const gh = (args, input, inspect = false) => {
    const result = run('gh', args, {env: {...childEnv, GH_TOKEN: inspect ? env.GITHUB_TOKEN : childEnv.GH_TOKEN}, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 1024 * 1024})
    if (result.status !== 0 || result.error) {
      // Fixed labels only; gh stderr may contain sensitive request context.
      const phase = args[0] === 'api' ? 'PROTECTION_INSPECTION' : args[1] === 'list' ? 'DESTINATION_INVENTORY' : 'SECRET_TRANSFER'
      throw new Error(`RECOVERY_COPY_${phase}_FAILED`)
    }
    return result.stdout
  }
  const config = JSON.parse(gh(['api', `repos/${repo}/environments/${destination}`], undefined, true))
  const branches = JSON.parse(gh(['api', `repos/${repo}/environments/${destination}/deployment-branch-policies`], undefined, true))
  const reviewer = config.protection_rules?.some(rule => rule.type === 'required_reviewers' && rule.reviewers?.some(entry => entry.type === 'User' && entry.reviewer?.id === 231313481))
  if (!reviewer || config.deployment_branch_policy?.custom_branch_policies !== true || config.deployment_branch_policy?.protected_branches !== false || branches.total_count !== 1 || branches.branch_policies?.[0]?.name !== 'v2-onboarding-staging' || branches.branch_policies?.[0]?.type !== 'branch') throw new Error('RECOVERY_COPY_DESTINATION_NOT_PROTECTED')
  const existing = JSON.parse(gh(['secret', 'list', '--repo', repo, '--env', destination, '--json', 'name']))
  if (existing.length !== 0) throw new Error('RECOVERY_COPY_ALREADY_PRESENT_VERIFY_WITHOUT_OVERWRITE')
  for (const name of names) if (!env[name]) throw new Error('RECOVERY_COPY_SOURCE_MISSING')
  const bytes = Buffer.from(env.WRITEOFFS_DELETION_LEDGER_KEY_BASE64, 'base64')
  try {
    if (bytes.length !== 32 || bytes.toString('base64') !== env.WRITEOFFS_DELETION_LEDGER_KEY_BASE64) throw new Error('RECOVERY_COPY_KEY_INVALID')
  } finally { bytes.fill(0) }
  for (const name of names) {
    const input = Buffer.from(env[name])
    try { gh(['secret', 'set', name, '--repo', repo, '--env', destination], input) }
    finally { input.fill(0) }
  }
  return {copied: names.length, destination, keyRegenerated: false, verifiedByRecoveryRead: false}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(JSON.stringify(copyProtectedRecoverySecrets({env: process.env})) + '\n') }
  catch (error) {
    const known = new Set(['RECOVERY_COPY_RUNNER_REQUIRED', 'RECOVERY_COPY_AUTH_REQUIRED', 'RECOVERY_COPY_INSPECTION_AUTH_REQUIRED', 'RECOVERY_COPY_DESTINATION_NOT_PROTECTED', 'RECOVERY_COPY_ALREADY_PRESENT_VERIFY_WITHOUT_OVERWRITE', 'RECOVERY_COPY_SOURCE_MISSING', 'RECOVERY_COPY_KEY_INVALID', 'RECOVERY_COPY_PROTECTION_INSPECTION_FAILED', 'RECOVERY_COPY_DESTINATION_INVENTORY_FAILED', 'RECOVERY_COPY_SECRET_TRANSFER_FAILED'])
    process.stderr.write(JSON.stringify({result: 'FAIL', code: known.has(error?.message) ? error.message : 'RECOVERY_COPY_UNCLASSIFIED_FAILURE'}) + '\n')
    process.exitCode = 1
  }
}
