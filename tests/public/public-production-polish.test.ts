import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isCustomerSignupEnabled } from '../../app/lib/auth/signup-policy'

const read = (path: string) => readFileSync(path, 'utf8')

describe('public production polish', () => {
  it('uses environment-aware login continuity without changing auth behavior', () => {
    const page = read('app/login/page.tsx')
    const form = read('app/login/LoginForm.tsx')
    expect(page).toContain('isCustomerSignupEnabled()')
    expect(form).toContain('supabase.auth.signInWithPassword')
    expect(form).toContain('signupEnabled')
    expect(form).toContain('Join the waitlist →')
    expect(form).toContain('Create an account')
    expect(isCustomerSignupEnabled({ WRITEOFFS_ENVIRONMENT: 'production' })).toBe(false)
    expect(isCustomerSignupEnabled({ WRITEOFFS_ENVIRONMENT: 'staging' })).toBe(true)
  })

  it('uses the public brand system without the old internal emoji treatment', () => {
    const page = read('app/login/page.tsx')
    expect(page).toContain('BrandLogo')
    expect(page).toContain('public-site')
    expect(page).not.toContain('🔑')
  })

  it('provides the complete restrained footer and only real destinations', () => {
    const footer = read('app/components/PublicFooter.tsx')
    for (const destination of ['/#how','/#features','/#for-you','/contact','/press','/legal/privacy','/legal/terms','/legal/tax-disclaimer','/#waitlist']) {
      expect(footer).toContain(destination)
    }
    expect(footer).not.toMatch(/\/pricing|\/about|\/faq/)
    expect(footer).toContain('BrandLogo')
  })

  it('adds a credible contact route with WriteOffs addresses', () => {
    const contact = read('app/contact/page.tsx')
    expect(contact).toContain('PublicPageShell')
    expect(contact).toContain('rick@writeoffs.io')
    expect(contact).toContain('press@writeoffs.io')
  })

  it('keeps the compatibility waitlist route pointed at the landing conversion', () => {
    const route = read('app/waitlist/page.tsx')
    expect(route).toContain("redirect('/#waitlist')")
    expect(route).not.toMatch(/private beta|founder perks|early access/i)
  })

  it('keeps public supporting routes inside the public header contract', () => {
    const header = read('app/components/Header.tsx')
    for (const route of ['/login','/contact','/press','/waitlist','/legal/']) {
      expect(header).toContain(route)
    }
    expect(header).toContain('public-mobile-menu')
    expect(header).toContain('Escape')
  })

  it('removes stale pricing authority and cleans factual legal copy', () => {
    expect(existsSync('app/components/Pricing.tsx')).toBe(false)
    for (const route of ['privacy','terms','tax-disclaimer']) {
      expect(read(`app/legal/${route}/page.tsx`)).not.toContain('rick@aiconciergeinc.com')
    }
    expect(read('app/legal/privacy/page.tsx')).not.toMatch(/bank aggregators, email/)
    expect(read('app/legal/tax-disclaimer/page.tsx')).not.toContain('FAQs')
    const terms = read('app/legal/terms/page.tsx')
    expect(terms).not.toContain('refund policy (if any)')
    expect(terms).toContain('month-to-month membership')
    expect(terms).toContain('paid access continues through the end of the current paid billing period')
    expect(terms).toContain('do not provide prorated or partial-month refunds')
  })

  it('keeps mobile and accessible public contracts explicit', () => {
    const form = read('app/components/WaitlistForm.tsx')
    const css = read('app/globals.css')
    expect(form).toContain('className="sr-only">Email address</label>')
    expect(form).toContain('aria-live=')
    expect(form).toContain('aria-busy=')
    expect(form).toContain('sm:grid-cols-')
    expect(css).toContain('@media (max-width:390px)')
    expect(css).toContain('.press-colors { grid-template-columns: 1fr; }')
  })
})
