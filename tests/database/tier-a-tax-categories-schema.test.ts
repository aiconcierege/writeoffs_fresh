import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20260819000700_add_2025_tier_a_tax_categories.sql', 'utf8')

describe('2025 Tier A tax-category lookup migration', () => {
  it('adds only the seven stable lookup keys without classifying existing activity', () => {
    const keys = [...sql.matchAll(/\('([^']+)',\s*'[^']+'\)/g)].map((match) => match[1])
    expect(keys).toEqual(['advertising', 'office-expense', 'supplies', 'postage-shipping',
      'software-cloud', 'payment-bank-fees', 'business-license'])
    expect(sql).toContain('on conflict (key) do nothing')
    expect(sql).not.toMatch(/bookkeeping_(?:allocations|tax_treatments)/)
  })
})
