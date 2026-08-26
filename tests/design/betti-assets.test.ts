import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BETTI_STATES } from '../../app/components/BettiIllustration'

const source = readFileSync('app/components/BettiIllustration.tsx', 'utf8')
const contract = readFileSync('public/betti/README.md', 'utf8')

describe('Betti illustration contract', () => {
  it('uses one bounded set of approved production states', () => {
    expect(BETTI_STATES).toEqual(['working', 'question', 'caught-up', 'welcome'])
    for (const state of BETTI_STATES) {
      expect(source).toContain(`/betti/betti-${state}.png`)
      expect(contract).toContain(`betti-${state}.png`)
    }
  })

  it('keeps Betti separate from the immutable WriteOffs logo', () => {
    expect(source).not.toMatch(/import\s+BrandLogo/)
    expect(contract).toMatch(/must not\s+contain generated substitutes/)
    expect(contract).toContain('Do not redraw')
  })

  it('provides accessible semantic and decorative rendering', () => {
    expect(source).toContain("alt={decorative ? '' : descriptions[state]}")
    expect(source).toContain('sizes={sizes}')
  })
})
