import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('Plaid Production readiness contracts', () => {
  it('keeps Production activation explicit without limiting Link to Sandbox', () => {
    const config = read('app/lib/plaid/config.ts')
    const service = read('app/lib/plaid/service.ts')
    expect(config).toContain("applicationEnvironment === 'production' && process.env.PLAID_PRODUCTION_ENABLED === 'true'")
    expect(config).toContain("environment === 'sandbox'")
    expect(service).toContain('requirePlaidLink()')
    expect(service).not.toContain('requirePlaidSandboxLink')
  })

  it('resumes mobile OAuth with the original short-lived Link token', () => {
    const component = read('app/components/BankConnect.tsx')
    expect(component).toContain("url.searchParams.has('oauth_state_id')")
    expect(component).toContain('receivedRedirectUri')
    expect(component).toContain('sessionStorage.setItem(OAUTH_LINK_TOKEN_KEY, body.linkToken)')
    expect(component).toContain('sessionStorage.getItem(OAUTH_LINK_TOKEN_KEY)')
    expect(component).toContain('clearOAuthResumeState()')
    expect(component).not.toMatch(/access[_-]?token/i)
  })

  it('discloses Plaid before Link without exposing credentials', () => {
    const component = read('app/components/BankConnect.tsx')
    expect(component).toContain('WriteOffs uses Plaid')
    expect(component).toContain('Plaid End User Privacy Policy')
    expect(component).not.toMatch(/PLAID_SECRET|PLAID_CLIENT_ID|SUPABASE_SERVICE_ROLE_KEY/)
  })
})
