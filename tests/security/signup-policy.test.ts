import { describe, expect, it } from 'vitest'
import { isCustomerSignupEnabled } from '../../app/lib/auth/signup-policy'
import { readFileSync } from 'node:fs'

describe('customer signup environment policy', () => {
  it('lets the server-rendered login choose signup or waitlist from the canonical policy', () => {
    const login = readFileSync('app/login/page.tsx', 'utf8')
    const form = readFileSync('app/login/LoginForm.tsx', 'utf8')
    expect(login).toContain('isCustomerSignupEnabled()')
    expect(form).toContain('<Link href="/signup"')
    expect(form).toContain('Create an account')
    expect(form).toContain('<Link href="/#waitlist"')
    expect(form).toContain('Join the waitlist →')
  })

  it('allows the real customer signup path in staging', () => {
    expect(isCustomerSignupEnabled({ WRITEOFFS_ENVIRONMENT: 'staging',
      NEXT_PUBLIC_ENABLE_SIGNUP: 'false' })).toBe(true)
  })

  it('keeps production waitlist-only regardless of the legacy public flag', () => {
    expect(isCustomerSignupEnabled({ WRITEOFFS_ENVIRONMENT: 'production',
      NEXT_PUBLIC_ENABLE_SIGNUP: 'true' })).toBe(false)
  })

  it('applies the same policy in the Next.js 15 middleware signup gate', () => {
    const middleware = readFileSync('middleware.ts', 'utf8')
    expect(middleware).toContain("import { isCustomerSignupEnabled }")
    expect(middleware).toContain('const signupEnabled = isCustomerSignupEnabled()')
    expect(middleware).toContain("pathname.startsWith('/signup')")
    expect(middleware).toContain("url.searchParams.set('waitlist', '1')")
    expect(middleware).toContain('createServerClient')
    expect(middleware).toContain('supabase.auth.getUser()')
  })

  it('requires an explicit flag for local browser testing', () => {
    expect(isCustomerSignupEnabled({ WRITEOFFS_ENVIRONMENT: 'local',
      NEXT_PUBLIC_ENABLE_SIGNUP: 'false' })).toBe(false)
    expect(isCustomerSignupEnabled({ WRITEOFFS_ENVIRONMENT: 'local',
      NEXT_PUBLIC_ENABLE_SIGNUP: 'true' })).toBe(true)
  })
})
