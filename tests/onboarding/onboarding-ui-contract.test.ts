import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const flow = readFileSync('app/onboarding/OnboardingFlow.tsx', 'utf8')

describe('canonical v1 onboarding UI', () => {
  it('asks only the minimum plain-language factual sequence', () => {
    for (const copy of [
      'Tell us about your business.',
      'Is this business reported on Schedule C with your personal tax return?',
      'Are you starting fresh or bringing in an existing business?',
      'Does your business buy parts or materials for customer jobs?',
      'Does your business keep a significant amount of products or merchandise in stock to sell later?',
      'How have customer-job materials usually been handled at tax time?',
      'When should WriteOffs start organizing your activity?',
      'What would you like to add first?',
      'You’re ready to use WriteOffs.',
    ]) expect(flow).toContain(copy)
  })

  it('keeps Realtor as context in the same path without Pack language', () => {
    expect(flow).toContain('Real estate professional')
    expect(flow).toContain('without changing the product path')
    expect(flow).not.toMatch(/Realtor Pack|General Pack|industry pack/i)
  })

  it('supports trades and distinguishes ordinary leftovers from substantial merchandise', () => {
    expect(flow).toContain('fixtures, parts, paint, wire, equipment, or project materials')
    expect(flow).toContain('Don’t count normal leftover parts or materials you keep for future jobs.')
    expect(flow).toContain('supports trades and service businesses with job materials')
  })

  it('does not ask customers to configure accounting or legacy product concepts', () => {
    for (const forbidden of ['COGS', '§471', 'NIMS', 'chart of accounts', 'reconciliation', 'Plan recommendation', 'Home office', 'Add another vehicle', 'Connect my accounts']) {
      expect(flow).not.toContain(forbidden)
    }
  })

  it('keeps uncertain materials history usable without inventing tax timing', () => {
    expect(flow).toContain('My accountant handles this')
    expect(flow).toContain('I’m not sure')
    expect(flow).toContain('tax timing stays unresolved rather than being guessed')
  })

  it('offers current canonical ingestion paths and no Plaid workflow', () => {
    expect(flow).toContain('Import a CSV')
    expect(flow).toContain('Upload receipts')
    expect(flow).toContain('Bank connections are not required.')
    expect(flow).not.toMatch(/\/api\/(plaid|stripe|checkout)/i)
  })

  it('has accessible progress, focus, error, and mobile-sized actions', () => {
    expect(flow).toContain('role="progressbar"')
    expect(flow).toContain('headingRef.current?.focus')
    expect(flow).toContain('role="alert"')
    expect(flow).toContain('min-h-11')
  })
})
