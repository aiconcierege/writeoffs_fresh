import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const pressPage = readFileSync(join(root, 'app/press/page.tsx'), 'utf8')

describe('press kit assets', () => {
  const downloads = [
    '/media/writeoffs_logo_clean.png',
    '/logo.svg',
    '/og/og-default.png',
  ]

  it.each(downloads)('uses an existing approved asset for %s', (publicPath) => {
    expect(pressPage).toContain(`href="${publicPath}"`)
    expect(existsSync(join(root, 'public', publicPath.slice(1)))).toBe(true)
  })

  it('does not reference the missing legacy press downloads', () => {
    expect(pressPage).not.toContain('/press/writeoffs_logo_clean.png')
    expect(pressPage).not.toContain('/press/writeoffs_logo_clean.svg')
    expect(pressPage).not.toContain('/press/icon.png')
  })
})
