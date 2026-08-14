import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const flow = readFileSync(
  join(process.cwd(), 'app/onboarding/OnboardingFlow.tsx'),
  'utf8'
)

describe('v2 onboarding UI contract', () => {
  it('contains the nine approved conversational steps', () => {
    for (const copy of [
      'First, tell us about your business.',
      'How is your business organized?',
      'When did this business start?',
      'Do you use part of your home for your business?',
      'Do you use a vehicle for business?',
      'How many financial accounts do you expect WriteOffs to work with?',
      'How would you like to get started?',
      'Here’s the plan that best fits your answers.',
      'Review your setup.',
    ]) {
      expect(flow).toContain(copy)
    }
  })

  it('uses only the committed onboarding endpoints', () => {
    expect(flow).toContain("requestJson('/api/onboarding/business'")
    expect(flow).toContain('`/api/onboarding/vehicles/${vehicle.slot}`')
    expect(flow).toContain('`/api/onboarding/vehicles/${slot}/archive`')
    expect(flow).toContain("fetch('/api/onboarding/complete'")
    expect(flow).not.toMatch(/\/api\/(checkout|stripe|plaid|financial)/i)
  })

  it('keeps recommendations informational and uses the deterministic helper', () => {
    expect(flow).toContain('recommendOnboardingPlan')
    expect(flow).toContain('This recommendation is informational.')
    expect(flow).toContain('no subscription will be created today')
    expect(flow).not.toContain('/api/checkout')
  })

  it('does not offer or branch on legacy industry paths', () => {
    expect(flow).not.toMatch(/\brealtor\b/i)
    expect(flow).not.toMatch(/\bvertical\b/i)
    expect(flow).not.toMatch(/\bindustry\b/i)
    expect(flow).not.toContain('General Pack')
    expect(flow).not.toContain('Realtor Pack')
  })

  it('uses the approved home-office copy and omits commuting education', () => {
    expect(flow).toContain('Do you use part of your home for your business?')
    expect(flow).not.toContain('Do you have a qualifying home office?')
    expect(flow).toContain('regularly and exclusively for business')
    expect(flow).toContain('simplified method')
    expect(flow).not.toMatch(/commut/i)
  })

  it('supports incremental saves, retry-safe errors, progress, and returned navigation', () => {
    expect(flow).toContain("method: 'PATCH'")
    expect(flow).toContain("method: 'PUT'")
    expect(flow).toContain('Your answers are still here.')
    expect(flow).toContain('role="progressbar"')
    expect(flow).toContain('aria-live="polite"')
    expect(flow).toContain('router.push(data.destination)')
  })
})
