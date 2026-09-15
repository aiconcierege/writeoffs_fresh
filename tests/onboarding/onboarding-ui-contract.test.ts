import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const flow = readFileSync('app/onboarding/OnboardingFlow.tsx', 'utf8')

describe('canonical v1 onboarding UI', () => {
  it('asks only the minimum plain-language factual sequence', () => {
    for (const copy of [
      'Tell us about your business.',
      'How do you report this business on your taxes?',
      'Are you starting fresh or bringing in an existing business?',
      'Does your business buy parts or materials for customer jobs?',
      'Does your business keep a significant amount of products or merchandise in stock to sell later?',
      'How far back should Betti organize your books?',
      'Let’s connect your business accounts',
      'You’re ready to use WriteOffs.',
    ]) expect(flow).toContain(copy)
  })

  it('uses the business description without exposing vertical products', () => {
    expect(flow).toContain('What does your business do?')
    expect(flow).not.toMatch(/Realtor|General Pack|industry pack|business_profile_context/i)
  })

  it('supports trades and distinguishes ordinary leftovers from substantial merchandise', () => {
    expect(flow).toContain('fixtures, parts, paint, wire, equipment, or project materials')
    expect(flow).toContain('Don’t count normal leftover parts or materials you keep for future jobs.')
    expect(flow).toContain('supports trades and service businesses with job materials')
  })

  it('does not ask customers to configure accounting or legacy product concepts', () => {
    for (const forbidden of ['COGS', '§471', 'NIMS', 'chart of accounts', 'reconciliation', 'Plan recommendation', 'Home office', 'Add another vehicle']) {
      expect(flow).not.toContain(forbidden)
    }
  })

  it('removes customer tax-method choices while retaining factual uncertainty', () => {
    expect(flow).not.toContain('My accountant handles this')
    expect(flow).not.toContain('How have customer-job materials usually been handled')
    expect(flow).toContain('I’m not sure')
  })
  it('leads with connected accounts and keeps documents secondary', () => {
    expect(flow).toContain('Connect my accounts')
    expect(flow).toContain('Upload bank or credit-card statements')
    expect(flow).toContain('Start with receipts')
    expect(flow).not.toContain('Import a CSV')
  })

  it('has accessible progress, focus, error, and mobile-sized actions', () => {
    expect(flow).toContain('role="progressbar"')
    expect(flow).toContain('headingRef.current?.focus')
    expect(flow).toContain('role="alert"')
    expect(flow).toContain('aria-live="assertive"')
    expect(flow).toContain('aria-busy={saving}')
    expect(flow).toContain('min-h-11')
  })

  it('hands completion to the selected activity while keeping Home available', () => {
    expect(flow).toContain("router.push('/get-started')")
    expect(flow).toContain('Start using WriteOffs')
  })
})
