import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isAuthenticatedRoute } from '../../app/lib/route-policy'
import { MFA_SECURITY_API_PATH, mfaEnforcementMode, safeAuthenticatedNext, SECURITY_SETTINGS_PATH } from '../../app/lib/auth/mfa-policy'

const read = (file: string) => readFileSync(file, 'utf8')
const require = createRequire(import.meta.url)
const { validateEnvironment } = require('../../config/environment-safety.js') as { validateEnvironment: (env: Record<string,string|undefined>) => unknown }

describe('account protection', () => {
  it('supports staged mandatory MFA without an implicit production bypass', () => {
    expect(mfaEnforcementMode(undefined)).toBe('enrolled')
    expect(mfaEnforcementMode('required')).toBe('required')
    expect(mfaEnforcementMode('off')).toBe('off')
    const middleware = read('middleware.ts')
    expect(middleware).toContain("url.pathname = '/mfa/challenge'")
    expect(middleware).toContain('url.pathname = SECURITY_SETTINGS_PATH')
    expect(middleware).toContain("assurance?.currentLevel !== 'aal2'")
  })

  it('implements enrollment, challenge, and protected removal with customer-safe errors', () => {
    const settings = read('app/settings/security/SecuritySettings.tsx')
    expect(read('app/lib/auth/totp-enrollment.ts')).toContain("factorType: 'totp'")
    expect(settings).toContain('challengeAndVerify')
    expect(settings).toContain('Enter the 6-digit code')
    expect(settings).toContain('That code didn’t work. Try again.')
    const removal = read('app/api/settings/security/mfa/route.ts')
    expect(removal).toContain("currentLevel !== 'aal2'")
    expect(removal).toContain('listFactors()')
    expect(removal).toContain('factor.id === body.factorId')
    expect(removal).not.toMatch(/service.role|SUPABASE_SERVICE_ROLE/i)
  })

  it('uses only the canonical Security route throughout the MFA workflow', () => {
    const files = [
      'app/settings/security/SecuritySettings.tsx',
      'app/mfa/challenge/MfaChallenge.tsx',
      'middleware.ts',
      'app/components/Header.tsx',
      'app/settings/page.tsx',
      'app/lib/auth/mfa-policy.ts',
    ]
    expect(SECURITY_SETTINGS_PATH).toBe('/settings/security')
    expect(MFA_SECURITY_API_PATH).toBe('/api/settings/security/mfa')
    for (const file of files) expect(read(file), file).not.toContain('/account/security')
    const settings = read('app/settings/security/SecuritySettings.tsx')
    expect(settings).toContain('action={SECURITY_SETTINGS_PATH}')
    expect(settings).toContain('event.preventDefault()')
  })

  it('protects MFA, reset, and security routes and validates redirect destinations', () => {
    for (const route of ['/mfa/challenge', '/reset-password', '/settings/security']) expect(isAuthenticatedRoute(route), route).toBe(true)
    expect(safeAuthenticatedNext('/reports/tax-time')).toBe('/reports/tax-time')
    expect(safeAuthenticatedNext('//evil.example')).toBe('/home')
    expect(safeAuthenticatedNext('/\\evil.example')).toBe('/home')
    expect(safeAuthenticatedNext('/login')).toBe('/home')
  })

  it('keeps password recovery enumeration-safe and preserves MFA after reset', () => {
    const recovery = read('app/recover/page.tsx')
    expect(recovery).toContain('if the account exists')
    expect(recovery).not.toMatch(/user not found|no account/i)
    const reset = read('app/reset-password/page.tsx')
    expect(reset).toContain('Two-factor authentication remains required')
    expect(reset).toContain('supabase.auth.signOut()')
    expect(read('app/login/page.tsx')).not.toContain('setErr(error.message)')
  })

  it('blocks accidental remote Supabase use in local development', () => {
    expect(() => validateEnvironment({ NODE_ENV:'development', WRITEOFFS_ENVIRONMENT:'local', NEXT_PUBLIC_SUPABASE_URL:'https://staging.example.supabase.co' })).toThrow(/remote Supabase/)
    expect(() => validateEnvironment({ NODE_ENV:'development', WRITEOFFS_ENVIRONMENT:'local', NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321' })).not.toThrow()
    expect(() => validateEnvironment({ NODE_ENV:'development', WRITEOFFS_ENVIRONMENT:'local', NEXT_PUBLIC_SUPABASE_URL:'https://staging.example.supabase.co', ALLOW_REMOTE_SUPABASE_IN_DEV:'true' })).not.toThrow()
  })

  it('keeps service-role credentials server-only', () => {
    expect(read('utils/supabase/admin.ts')).toContain("import 'server-only'")
    expect(read('.env.example')).not.toMatch(/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/)
    for (const file of ['utils/supabase/client.ts','app/login/page.tsx','app/settings/security/SecuritySettings.tsx']) {
      expect(read(file), file).not.toMatch(/SUPABASE_SERVICE_ROLE|service_role/i)
    }
  })

  it('documents every security and environment control without values', () => {
    const example = read('.env.example')
    for (const variable of ['WRITEOFFS_ENVIRONMENT','ALLOW_REMOTE_SUPABASE_IN_DEV','MFA_ENFORCEMENT_MODE','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY']) expect(example).toContain(`${variable}=`)
    expect(read('.gitignore')).toContain('.env.*')
    const robots = read('app/robots.ts')
    for (const path of ['/login','/signup','/recover','/reset-password','/mfa']) expect(robots).toContain(`"${path}"`)
  })

  it('configures bounded launch-safe response headers', () => {
    const config = read('next.config.js')
    for (const header of ['X-Content-Type-Options','X-Frame-Options','Referrer-Policy','Permissions-Policy','Content-Security-Policy']) expect(config).toContain(header)
    expect(config).toContain("frame-ancestors 'none'")
  })
})

describe('representative canonical tenant isolation', () => {
  it.each([
    ['Businesses','supabase/migrations/20260722000200_create_businesses.sql','businesses_select_own'],
    ['Financial transactions','supabase/migrations/20260722000400_create_financial_transactions.sql','financial_transactions_select_own_business'],
    ['Bookkeeping records','supabase/migrations/20260814000300_add_canonical_bookkeeping_foundation.sql','bookkeeping_records_select_own_business'],
    ['Receipts','supabase/migrations/20260722000100_baseline_existing_schema.sql','receipts_select_own'],
    ['Manual money','supabase/migrations/20260824000300_add_canonical_manual_financial_activity.sql','manual_financial_sources_select_own'],
    ['Mileage','supabase/migrations/20260824000200_add_canonical_business_mileage.sql','mileage'],
    ['Invoices','supabase/migrations/20260824000400_add_canonical_invoice_workflow.sql','canonical_invoices_select_own'],
    ['Contractors','supabase/migrations/20260824000600_add_contractor_awareness.sql','contractors_select_own'],
    ['Deduction facts','supabase/migrations/20260824000500_add_deduction_intelligence_foundation.sql','deduction_facts_select_own'],
  ])('%s enables RLS and scopes authenticated reads', (_label, file, policy) => {
    const sql = read(file)
    expect(sql).toMatch(/enable row level security/i)
    expect(sql).toContain(policy)
    expect(sql).toMatch(/auth\.uid\(\)/i)
  })

  it('keeps security-invoker current-state views', () => {
    for (const file of ['supabase/migrations/20260824000300_add_canonical_manual_financial_activity.sql','supabase/migrations/20260824000400_add_canonical_invoice_workflow.sql','supabase/migrations/20260824000500_add_deduction_intelligence_foundation.sql','supabase/migrations/20260824000600_add_contractor_awareness.sql']) {
      expect(read(file), file).toMatch(/security_invoker\s*=\s*true/i)
    }
  })
})
