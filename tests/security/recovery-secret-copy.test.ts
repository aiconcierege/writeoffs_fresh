import {describe, expect, it} from 'vitest'
import {randomBytes} from 'node:crypto'
import {copyProtectedRecoverySecrets} from '../../scripts/backup/copy-protected-recovery-secrets.mjs'

describe('protected recovery secret transfer', () => {
  const env = {GITHUB_TOKEN: 'test-read-only-token', GITHUB_REPOSITORY: 'aiconcierege/writeoffs_fresh', GITHUB_REF: 'refs/heads/v2-onboarding-staging', GITHUB_EVENT_NAME: 'workflow_dispatch', WRITEOFFS_RECOVERY_BOOTSTRAP_TOKEN: 'test-token', WRITEOFFS_DELETION_LEDGER_KEY_BASE64: randomBytes(32).toString('base64'), WRITEOFFS_DELETION_LEDGER_RECOVERY_ACCESS_KEY_ID: 'test-reader-id', WRITEOFFS_DELETION_LEDGER_RECOVERY_SECRET_ACCESS_KEY: 'test-reader-secret'}
  function fixture(protectedEnv = true, exists = false) {
    const copied: string[] = []
    const run = (...values: unknown[]) => {
      const args = values[1] as string[]
      const options = values[2] as {input: Buffer; env: Record<string, string>}
      expect(options.env.GH_TOKEN).toBe(args[0] === 'api' ? env.GITHUB_TOKEN : env.WRITEOFFS_RECOVERY_BOOTSTRAP_TOKEN)
      expect(options.env).not.toHaveProperty('WRITEOFFS_DELETION_LEDGER_KEY_BASE64')
      expect(args).not.toContain(env.WRITEOFFS_DELETION_LEDGER_KEY_BASE64)
      let result: unknown = {}
      if (args[0] === 'api' && args[1].endsWith('deployment-branch-policies')) result = {total_count: 1, branch_policies: [{name: 'v2-onboarding-staging', type: 'branch'}]}
      else if (args[0] === 'api') result = {deployment_branch_policy: {custom_branch_policies: protectedEnv, protected_branches: false}, protection_rules: [{type: 'required_reviewers', reviewers: [{type: 'User', reviewer: {id: 231313481}}]}]}
      else if (args[1] === 'list') result = exists ? [{name: 'WRITEOFFS_DELETION_LEDGER_KEY_BASE64'}] : []
      else if (args[1] === 'set') {
        expect(options.input.toString()).toBe(env[args[2] as keyof typeof env])
        copied.push(args[2])
      }
      return {status: 0, stdout: JSON.stringify(result)}
    }
    return {run, copied}
  }
  it('copies only the existing key and reader credentials through stdin', () => {
    const f = fixture()
    const result = copyProtectedRecoverySecrets({env, run: f.run})
    expect(f.copied).toHaveLength(3)
    expect(result.keyRegenerated).toBe(false)
    expect(result.verifiedByRecoveryRead).toBe(false)
    expect(JSON.stringify(result)).not.toContain(env.WRITEOFFS_DELETION_LEDGER_KEY_BASE64)
  })
  it('refuses unprotected destinations and existing copies without overwriting', () => {
    expect(() => copyProtectedRecoverySecrets({env, run: fixture(false).run})).toThrow('DESTINATION_NOT_PROTECTED')
    expect(() => copyProtectedRecoverySecrets({env, run: fixture(true, true).run})).toThrow('ALREADY_PRESENT')
  })
})
