import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { planFromPriceId, launchMembership } from '../../app/lib/membership/plans'

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(file) : [file]
  })
}

describe('repository hygiene and retained subscription history', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('contains no numbered, copy, or backup TypeScript source files', () => {
    expect(sourceFiles('app').filter(file => /(?: \d+| copy|\.bak)\.(?:ts|tsx)$/i.test(file))).toEqual([])
  })
  it('offers one launch price while still recognizing both historical subscriptions', () => {
    vi.stubEnv('STRIPE_MEMBERSHIP_PRICE_ID', 'price_launch')
    vi.stubEnv('STRIPE_EXPENSES_PRICE_ID', 'price_old_expenses')
    vi.stubEnv('STRIPE_BUSINESS_PRICE_ID', 'price_old_business')
    expect(launchMembership.monthlyCents).toBe(3900)
    expect(planFromPriceId('price_launch')).toBe('business')
    expect(planFromPriceId('price_old_expenses')).toBe('expenses')
    expect(planFromPriceId('price_old_business')).toBe('business')
    expect(planFromPriceId('unknown')).toBeNull()
  })
})
