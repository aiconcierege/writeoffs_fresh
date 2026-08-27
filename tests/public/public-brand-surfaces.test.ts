import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('public WriteOffs brand surfaces', () => {
  it('uses one shared public footer and legal shell', () => {
    expect(readFileSync('app/page.tsx', 'utf8')).toContain('<PublicFooter/>')
    for (const route of ['privacy', 'terms', 'tax-disclaimer']) {
      expect(readFileSync(`app/legal/${route}/page.tsx`, 'utf8')).toContain('<PublicPageShell')
    }
  })

  it('introduces Betti once on the landing page', () => {
    const landing = readFileSync('app/page.tsx', 'utf8')
    expect(landing.match(/<BettiIllustration/g)).toHaveLength(1)
    expect(landing).toContain('Meet Betti the Bookkeeper')
  })

  it('keeps current bookkeeping positioning in the press boilerplate', () => {
    const press = readFileSync('app/press/page.tsx', 'utf8')
    expect(press).toContain('bookkeeping for self-employed and independent businesses')
    expect(press).toContain('does not prepare or file tax returns')
    expect(press).not.toContain('deduction-first')
    expect(press).not.toContain('gig workers')
  })

  it('keeps public branding and conversion available in a sticky responsive header', () => {
    const header = readFileSync('app/components/Header.tsx', 'utf8')
    expect(header).toContain('public-header fixed top-0')
    expect(header).toContain('BrandLogo heightPx={scrolled ? 34 : 40}')
    expect(header).toContain('aria-label="Public mobile"')
    expect(header).toContain('Join the waitlist')
  })
})
