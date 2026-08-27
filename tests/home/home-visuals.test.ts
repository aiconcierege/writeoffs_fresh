import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { accountCheckLabel, checkInDayLabel } from '../../app/lib/home/operating-status-model'

describe('Home canonical visual derivations', () => {
  it('formats successful account checks in the stored Business timezone', () => {
    expect(accountCheckLabel('2026-08-27T23:42:00.000Z', 'America/Phoenix'))
      .toContain('Aug 27, 2026, 4:42 PM')
    expect(accountCheckLabel('invalid', 'America/Phoenix')).toBeNull()
  })

  it('uses the canonical cadence weekday without inventing a time', () => {
    expect(checkInDayLabel(5)).toBe('Friday')
    expect(checkInDayLabel(null)).toBeNull()
    const operating = readFileSync('app/home/HomeOperatingStatus.tsx', 'utf8')
    expect(operating).toContain('A specific time isn’t scheduled yet.')
  })

  it('replaces historical charting with current operating status', () => {
    const home = readFileSync('app/home/page.tsx', 'utf8')
    const visuals = readFileSync('app/home/HomeVisuals.tsx', 'utf8')
    const repository = readFileSync('app/lib/home/operating-status.ts', 'utf8')
    const operating = readFileSync('app/home/HomeOperatingStatus.tsx', 'utf8')
    expect(home).toContain('<HomeOperatingStatus status={operatingStatus}/>')
    expect(home).not.toContain('WriteoffRhythm')
    expect(visuals).not.toContain('Writeoffs found by month')
    expect(repository).toContain("rpc('list_plaid_connections')")
    expect(repository).toContain("from('current_business_review_cadence')")
    expect(repository).not.toContain("from('plaid_items')")
    expect(operating).toContain("fetch('/api/plaid/sync'")
  })
})
