import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import sitemap from '../../app/sitemap'

describe('legacy public Blog removal', () => {
  it('does not ship Blog routes or their private shell component', () => {
    const remainingEntries = existsSync('app/blog')
      ? readdirSync('app/blog', { recursive: true })
      : []
    expect(remainingEntries.some((entry) =>
      /(^|\/)(page|layout)\.(tsx|ts|jsx|js|mdx)$/.test(entry.toString())
    )).toBe(false)
    expect(existsSync('app/components/BlogShell.tsx')).toBe(false)
  })

  it('does not advertise Blog URLs in the public sitemap', () => {
    const urls = sitemap().map((entry) => entry.url)
    expect(urls.some((url) => new URL(url).pathname.startsWith('/blog')))
      .toBe(false)
  })

  it('does not retain public Blog references in application source', () => {
    const sitemapSource = readFileSync('app/sitemap.ts', 'utf8')
    const disclaimer = readFileSync('app/legal/tax-disclaimer/page.tsx', 'utf8')
    expect(sitemapSource).not.toMatch(/\/blog|["']blog(?:\/|["'])/i)
    expect(disclaimer).not.toMatch(/\bblog\b/i)
  })
})
