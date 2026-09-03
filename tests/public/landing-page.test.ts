import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/page.tsx', 'utf8')
const header = readFileSync('app/components/Header.tsx', 'utf8')

describe('public landing page', () => {
  it('leads with the approved universal customer promise', () => {
    expect(page).toContain('You run your business.')
    expect(page).toContain('WriteOffs handles the books.')
    expect(page).toContain('Share your business activity and send us your receipts.')
    expect(page).toContain('Join the waitlist')
  })

  it('uses the focused Connect, Work, Answer narrative', () => {
    for (const copy of ['Send it over', 'WriteOffs works', 'Answer only when needed']) {
      expect(page).toContain(copy)
    }
    expect(page).toContain('What you get')
    expect(page).toContain('Built for independent business')
  })

  it('does not reintroduce vertical or accounting-workflow marketing', () => {
    expect(page).not.toMatch(/Realtor|General Pack|Realtor Pack|vertical selector/i)
    expect(page).not.toMatch(/OCR|confidence score|canonical|reconciliation|categorization workflow/i)
    expect(page).not.toContain('/blog')
  })

  it('uses optimized responsive hero imagery and truthful waitlist behavior', () => {
    expect(page).toContain('src="/writeoffs-business-owner-hero.png"')
    expect(page).toContain('<Image')
    expect(page).toContain('sizes="(max-width: 1023px) 100vw, 48vw"')
    expect(page).toContain('<WaitlistForm source="landing#waitlist"')
    expect(page).not.toMatch(/Start free|Buy now|Subscribe|per month/i)
  })

  it('keeps the photo caption readable on a compact solid warm-cream card', () => {
    const caption = page.slice(
      page.indexOf('absolute bottom-4 left-4'),
      page.indexOf('</div>', page.indexOf('absolute bottom-4 left-4')),
    )

    expect(caption).toContain('bg-[#fffaf3]')
    expect(caption).toContain('max-w-[17rem]')
    expect(caption).toContain('sm:right-auto')
    expect(caption).toContain('uppercase tracking-[0.14em]')
    expect(caption).toContain('text-lg')
    expect(caption).not.toMatch(/backdrop-blur|bg-white\//)
  })

  it('keeps the approved hero without the removed early-access qualifier', () => {
    expect(page).not.toContain('Early access for U.S. independent business owners.')
  })

  it('describes public availability consistently as a waitlist', () => {
    expect(page).toContain('Join the waitlist')
    expect(page).toContain('Run your business. Leave the books to WriteOffs.')
    expect(page).toContain('Join the waitlist to hear when WriteOffs is ready for your business.')
    expect(page).toContain('We’ll let you know when it’s your turn.')
    expect(page).not.toMatch(/join early access|early access opens/i)
  })

  it('keeps public navigation aligned with the page story', () => {
    expect(header).toContain('href="/#how"')
    expect(header).toContain('href="/#features"')
    expect(header).toContain('href="/#for-you"')
    expect(header).not.toContain('href="/#faq"')
  })

  it('introduces canonical Betti once and keeps How It Works mascot-free', () => {
    expect(page.match(/<BettiIllustration/g)).toHaveLength(1)
    expect(page).toContain('state="welcome"')
    expect(page).toContain('Meet Betti the Bookkeeper')
    expect(page).not.toContain('grid h-8 w-8 place-items-center')
  })

  it('lets full-body Welcome Betti bridge the Meet Betti and features sections', () => {
    const meetBetti = page.slice(
      page.indexOf('betti-landing-section'),
      page.indexOf('<section id="features"'),
    )

    expect(meetBetti).toContain('relative z-10 overflow-visible')
    expect(meetBetti).toContain('betti-landing-art')
    expect(meetBetti).not.toContain('overflow-hidden')
    expect(meetBetti).toContain('-bottom-14')
    expect(page).toContain('<section id="features" className="relative z-0')
  })
})
