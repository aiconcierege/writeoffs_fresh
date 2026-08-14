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
      'When did your business start?',
      'Do you use part of your home for your business?',
      'Do you use a vehicle for business?',
      'How many bank accounts and credit cards will you be adding to WriteOffs for bookkeeping?',
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
    expect(flow).toContain('Does your home workspace meet this description?')
    expect(flow).not.toMatch(/commut/i)
  })

  it('restores scroll position and accessible heading focus whenever the step changes', () => {
    expect(flow).toContain("contentRef.current?.scrollIntoView")
    expect(flow).toContain("block: 'start'")
    expect(flow).toContain("headingRef.current?.focus({ preventScroll: true })")
    expect(flow).toContain("'(prefers-reduced-motion: reduce)'")
    expect(flow).toContain('}, [step])')
    expect(flow).toContain('if (next) setStep(next)')
    expect(flow).toContain('if (previous) setStep(previous)')
    expect(flow).toContain('editStep={setStep}')
  })

  it('uses the revised start, vehicle, and bank/card language', () => {
    expect(flow).toContain('Date business started (Month/Year)')
    expect(flow).toContain('Add another vehicle')
    expect(flow).not.toContain('Add a second vehicle')
    expect(flow).toContain('Number of accounts and cards')
    expect(flow).toContain('Are any of these accounts or cards also used for personal expenses?')
    expect(flow).toContain('No, they’re primarily for business')
    expect(flow).toContain('Yes, at least one is mixed business and personal')
    expect(flow).toContain("'primarily_business'")
    expect(flow).toContain("'mixed_use'")
  })

  it('keeps legal and federal reporting separate while filtering confusing choices', () => {
    expect(flow).toContain("corporation: ['Corporation (S or C)'")
    expect(flow).toContain("sole_proprietor: ['schedule_c', 's_corporation', 'c_corporation', 'not_sure']")
    expect(flow).toContain("single_member_llc: ['schedule_c', 's_corporation', 'c_corporation', 'not_sure']")
    expect(flow).toContain("partnership_multi_member_llc: ['partnership', 's_corporation', 'c_corporation', 'not_sure']")
    expect(flow).toContain("corporation: ['s_corporation', 'c_corporation', 'not_sure']")
    expect(flow).toContain("not_sure: ['schedule_c', 'partnership', 's_corporation', 'c_corporation', 'not_sure']")
    expect(flow).toContain("props.updateBusiness('federal_tax_reporting_type', null)")
    expect(flow).toContain("props.updateBusiness('legal_structure', value)")
    expect(flow).not.toMatch(/updateBusiness\('federal_tax_reporting_type',\s*(value|['"]\w+['"])\).*updateBusiness\('legal_structure'/s)
  })

  it('allows historical month/year input with only a future-date boundary', () => {
    expect(flow).toContain('type="month"')
    expect(flow).toContain('max={currentMonth}')
    expect(flow).not.toMatch(/<input[^>]+type="month"[^>]+min=/s)
    expect(flow).toContain('You can choose any past month and year.')
  })

  it('uses the revised starting choices without launching their workflows', () => {
    expect(flow).toContain('Start with receipts')
    expect(flow).toContain('Take photos or upload receipts and let WriteOffs start organizing your expenses.')
    expect(flow).toContain('Connect my accounts')
    expect(flow).toContain('Let WriteOffs use activity from your accounts to help organize your business finances.')
    expect(flow).toContain('Upload existing statements to bring in past activity.')
    expect(flow).toContain('You can add or change these later.')
    expect(flow).not.toContain('Starting workflow')
    expect(flow).not.toMatch(/\/api\/(plaid|stripe|upload|receipts?)/i)
    const connected = flow.indexOf('label="Connect my accounts"')
    const receipts = flow.indexOf('label="Start with receipts"')
    const statements = flow.indexOf('label="Upload statements"')
    expect(connected).toBeGreaterThan(-1)
    expect(connected).toBeLessThan(receipts)
    expect(receipts).toBeLessThan(statements)
    expect(flow.slice(connected, receipts)).toContain('badge="Recommended"')
    expect(flow).not.toMatch(/useState\([^)]*connected_financial_accounts/)
  })

  it('uses plain-language Review labels and summaries', () => {
    expect(flow).toContain("['Date business started'")
    expect(flow).toContain("['Bank accounts & credit cards'")
    expect(flow).toContain("['How you’ll get started'")
    expect(flow).toContain('primarily used for business')
    expect(flow).toContain('at least one is mixed business and personal')
    expect(flow).toContain('business & personal use')
    expect(flow).toContain('business use only')
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
