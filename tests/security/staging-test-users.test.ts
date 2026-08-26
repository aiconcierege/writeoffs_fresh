import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { hasStagingTestMfaBypass } from '../../app/lib/auth/staging-test-user'

const loadModule = createRequire(import.meta.url)
const { validateEnvironment } = loadModule('../../config/environment-safety.js') as {
  validateEnvironment: (environment: Record<string, string | undefined>) => unknown
}

describe('staging test users', () => {
  it('allows only an exact designated staging identity', () => {
    const environment = { WRITEOFFS_ENVIRONMENT: 'staging', WRITEOFFS_STAGING_MFA_BYPASS_ENABLED: 'true',
      WRITEOFFS_STAGING_TEST_USERS: 'ux@example.test, second@example.test' }
    expect(hasStagingTestMfaBypass('UX@example.test', environment)).toBe(true)
    expect(hasStagingTestMfaBypass('other@example.test', environment)).toBe(false)
    expect(hasStagingTestMfaBypass('prefix+ux@example.test', environment)).toBe(false)
  })

  it('cannot activate outside staging even with both switches present', () => {
    const configured = { WRITEOFFS_STAGING_MFA_BYPASS_ENABLED: 'true', WRITEOFFS_STAGING_TEST_USERS: 'ux@example.test' }
    expect(hasStagingTestMfaBypass('ux@example.test', { WRITEOFFS_ENVIRONMENT: 'production', ...configured })).toBe(false)
    expect(hasStagingTestMfaBypass('ux@example.test', { WRITEOFFS_ENVIRONMENT: 'local', ...configured })).toBe(false)
    expect(() => validateEnvironment({ WRITEOFFS_ENVIRONMENT: 'production', ...configured })).toThrow(/forbidden outside staging/)
    expect(() => validateEnvironment({ WRITEOFFS_ENVIRONMENT: 'local', ...configured })).toThrow(/forbidden outside staging/)
  })

  it('requires an allowlist and keeps the reset utility server/operator-only', () => {
    expect(() => validateEnvironment({ WRITEOFFS_ENVIRONMENT: 'staging', WRITEOFFS_STAGING_MFA_BYPASS_ENABLED: 'true' }))
      .toThrow(/explicit test-user allowlist/)
    const script = readFileSync('scripts/reset-staging-test-user.mjs', 'utf8')
    expect(script).toContain("process.env.WRITEOFFS_ENVIRONMENT !== 'staging'")
    expect(script).toContain("process.argv.includes('--confirm-reset')")
    expect(script).toContain("process.env.WRITEOFFS_STRIPE_MODE !== 'test'")
    expect(script).toContain('membership_provider_links')
    expect(script).not.toContain('deleteUser(')
  })
})
