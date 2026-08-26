import { describe, expect, it } from 'vitest'
import { isCustomerSignupEnabled } from '../../app/lib/auth/signup-policy'
import { readFileSync } from 'node:fs'

describe('customer signup environment policy', () => {
  it('links the login page directly to the canonical signup route', () => {
    const login = readFileSync('app/login/page.tsx', 'utf8')
    expect(login).toContain('<Link href="/signup"')
    expect(login).toContain('Create an account')
  })

  it('allows the real customer signup path in staging', () => {
    expect(isCustomerSignupEnabled({ WRITEOFFS_ENVIRONMENT: 'staging',
      NEXT_PUBLIC_ENABLE_SIGNUP: 'false' })).toBe(true)
  })

  it('keeps production waitlist-only regardless of the legacy public flag', () => {
    expect(isCustomerSignupEnabled({ WRITEOFFS_ENVIRONMENT: 'production',
      NEXT_PUBLIC_ENABLE_SIGNUP: 'true' })).toBe(false)
  })

  it('requires an explicit flag for local browser testing', () => {
    expect(isCustomerSignupEnabled({ WRITEOFFS_ENVIRONMENT: 'local',
      NEXT_PUBLIC_ENABLE_SIGNUP: 'false' })).toBe(false)
    expect(isCustomerSignupEnabled({ WRITEOFFS_ENVIRONMENT: 'local',
      NEXT_PUBLIC_ENABLE_SIGNUP: 'true' })).toBe(true)
  })
})
