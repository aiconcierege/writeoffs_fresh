import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/page.tsx', 'utf8')
const header = readFileSync('app/components/Header.tsx', 'utf8')

describe('public landing page', () => {
  it('leads with the approved universal customer promise', () => {
    expect(page).toContain('You run your business.')
    expect(page).toContain('WriteOffs handles the books.')
    expect(page).toContain('Connect your accounts and send us your receipts.')
    expect(page).toContain('Join the waitlist')
  })

  it('uses the focused Connect, Work, Answer narrative', () => {
    for (const copy of ['Connect', 'WriteOffs works', 'Answer only when needed']) {
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

  it('keeps public navigation aligned with the page story', () => {
    expect(header).toContain('href="/#how"')
    expect(header).toContain('href="/#features"')
    expect(header).toContain('href="/#for-you"')
    expect(header).not.toContain('href="/#faq"')
  })
})
