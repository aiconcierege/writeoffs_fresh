import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('universal Settings product path', () => {
  it('removes customer-facing vertical products and mutations', () => {
    const customerSources = [
      'app/settings/page.tsx', 'app/settings/profile/page.tsx',
      'app/settings/profile/SettingsForm.tsx', 'app/onboarding/OnboardingFlow.tsx',
      'app/import/page.tsx', 'app/login/page.tsx', 'app/login/LoginForm.tsx',
      'app/signup/page.tsx',
    ].map(read).join('\n')
    expect(customerSources).not.toMatch(/Realtor|General Pack|Realtor Pack|vertical pack|industry preset/i)
    expect(existsSync('app/settings/VerticalSwitcher.tsx')).toBe(false)
    expect(existsSync('app/api/profile/vertical/route.ts')).toBe(false)
    expect(existsSync('app/api/profile/init/route.ts')).toBe(false)
    expect(existsSync('app/components/Pricing.tsx')).toBe(false)
  })

  it('makes the existing Plaid banking experience reachable from authenticated Settings', () => {
    const profile = read('app/settings/profile/page.tsx')
    const settings = read('app/settings/page.tsx')
    const banking = read('app/settings/banking/page.tsx')
    const connect = read('app/components/BankConnect.tsx')
    expect(profile).toContain("redirect('/settings')")
    expect(settings).toContain('href="/settings/banking"')
    expect(profile).not.toMatch(/coming soon|disabled[\s\S]*Connect bank/i)
    expect(banking).toContain('<BankConnect')
    expect(connect).toContain("fetch('/api/plaid/link-token'")
    expect(connect).toContain("fetch('/api/plaid/exchange'")
  })

  it('keeps the legacy Realtor URL as a universal landing-page redirect', () => {
    expect(read('app/realtor/page.tsx')).toContain("redirect('/')")
  })
})
