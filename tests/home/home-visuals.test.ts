import { describe, expect, it } from 'vitest'
import { monthlyWriteoffRhythm } from '../../app/home/HomeVisuals'

describe('Home canonical visual derivations', () => {
  it('groups only canonical potential-writeoff dates from the requested year', () => {
    const months = monthlyWriteoffRhythm([
      { occurredOn: '2026-01-03' }, { occurredOn: '2026-01-31' },
      { occurredOn: '2026-02-01' }, { occurredOn: '2025-02-01' },
    ], 2026)
    expect(months[0]).toEqual({ label: 'Jan', count: 2 })
    expect(months[1]).toEqual({ label: 'Feb', count: 1 })
    expect(months.reduce((sum, month) => sum + month.count, 0)).toBe(3)
  })

  it('does not turn malformed or other-year dates into chart activity', () => {
    const months = monthlyWriteoffRhythm([
      { occurredOn: '2027-01-01' }, { occurredOn: 'not-a-date' },
    ], 2026)
    expect(months.every((month) => month.count === 0)).toBe(true)
  })
})
