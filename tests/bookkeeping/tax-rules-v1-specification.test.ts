import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PRODUCTION_TAX_RULE_CATALOG } from '../../app/lib/bookkeeping/tax-rule-catalog'

const proposal = readFileSync('docs/TAX_RULES_V1_PROPOSAL.md', 'utf8')
const catalog = readFileSync('docs/TAX_RULES_V1_CATALOG.md', 'utf8')
const authorities = readFileSync('docs/TAX_RULES_V1_AUTHORITIES.md', 'utf8')

describe('Tax Rules v1 approval specification', () => {
  it('keeps researched Tier B/C/D rules inactive while documenting the seven approved Tier A rules', () => {
    expect(PRODUCTION_TAX_RULE_CATALOG.rules).toHaveLength(7)
    expect(proposal).toMatch(/ACTIVE 2025 TIER A/i)
    expect(catalog).toMatch(/Tier B\/C\/D[\s\S]*candidate\/inactive/i)
  })

  it('uses one universal rule namespace without Realtor or General rule keys', () => {
    const documents = `${proposal}\n${catalog}`
    expect(documents).not.toMatch(/`(?:realtor|general)\.[a-z0-9_-]+`/i)
    expect(documents).toContain('`tax.advertising`')
    expect(proposal).toMatch(/one catalog, evaluator, question flow, reporting path/i)
  })

  it('documents all 32 candidates and the approved automation-tier counts', () => {
    expect(catalog.match(/^\| \d+ \|/gm)).toHaveLength(32)
    expect(proposal).toMatch(/7 Tier A, 15 Tier B, 7 Tier C, and\s+3 Tier D/)
  })

  it('uses only primary government web authorities and pins the research year', () => {
    const urls = [...authorities.matchAll(/https:\/\/[^)]+/g)].map(([url]) => url)
    expect(urls.length).toBeGreaterThanOrEqual(13)
    expect(urls.every((url) => url.startsWith('https://www.irs.gov/')
      || url.startsWith('https://uscode.house.gov/'))).toBe(true)
    expect(authorities).toMatch(/target is federal tax year 2025/i)
    expect(authorities).toMatch(/Verified\s+2026-08-19/i)
  })

  it('locks bookkeeping economics apart from downstream tax limitations', () => {
    expect(proposal).toMatch(/never changes the source amount, business allocation,[\s\S]*P&L expense/i)
    expect(proposal).toMatch(/fine or entertainment expense can be economically business/i)
    expect(catalog).toMatch(/Every row preserves the full economic business portion on the P&L/i)
  })
})
