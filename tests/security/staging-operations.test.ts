import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(file, 'utf8')

describe('staging operations contracts', () => {
  it('requires production-shaped staging identity and provider isolation', () => {
    const source = read('config/environment-safety.js')
    expect(source).toContain("if (name === 'staging')")
    expect(source).toContain("env.MFA_ENFORCEMENT_MODE !== 'required'")
    expect(source).toContain("stripeMode !== 'test'")
    expect(source).toContain("plaidMode !== 'sandbox'")
    expect(source).toContain("assertRemoteOrigin(env, 'Staging')")
  })

  it('documents the verified staging target without credentials', () => {
    const operations = read('docs/STAGING_OPERATIONS.md')
    expect(operations).toContain('writeoffs-staging')
    expect(operations).toContain('sgrqrrxrlglhjuetdtps')
    expect(operations).not.toMatch(/sk_(?:test|live)_[A-Za-z0-9]{12,}|whsec_[A-Za-z0-9]{12,}|service_role[^\s]{20,}/)
  })

  it('records all staged migrations in the applied order', () => {
    const report = read('docs/STAGING_MIGRATION_REHEARSAL.md')
    for (const version of ['20260824000100','20260824000200','20260824000300','20260824000400','20260824000500','20260824000600','20260825000100','20260825000200','20260825000300','20260825000400','20260825000500']) {
      expect(report).toContain(version)
    }
    expect(report).toContain('BACKUP/RESTORE PROOF INCOMPLETE')
  })

  it('does not overstate the incomplete deployment rehearsal', () => {
    const gate = read('docs/PRODUCTION_LAUNCH_GATE.md')
    expect(gate).toContain('| Migration set | READY |')
    expect(gate).toContain('| Smoke/staging | BLOCKED INTERNALLY |')
  })
})
