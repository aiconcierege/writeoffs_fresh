import { describe, expect, it } from 'vitest'
import { workPeriods } from '../../app/lib/bookkeeping/work-periods'
import type { AuthorizedBookkeepingScope } from '../../app/lib/bookkeeping/authorized-scope'

const scope: AuthorizedBookkeepingScope = {
  businessId: 'synthetic', selectedStart: '2026-01-01', authorizedStart: '2026-01-01',
  includedStart: '2026-08-01', activation: '2026-09-23', historicalAuthorized: true,
  currentFrom: '2026-08-01', catchUp: { from: '2026-01-01', through: '2026-07-31' },
}
describe('fixed purchased scope and rolling operational window', () => {
  it('includes August in ongoing books for a September signup', () => {
    expect(workPeriods(scope, '2026-09-23T12:00:00Z', 'America/Phoenix')).toEqual({
      today: '2026-09-23', recentFrom: '2026-08-01', ongoingFrom: '2026-08-01', cleanup: scope.catchUp,
    })
  })
  it('does not turn unfinished August into purchased cleanup in October', () => {
    const later = workPeriods(scope, '2026-10-23T12:00:00Z', 'America/Phoenix')
    expect(later.recentFrom).toBe('2026-09-01')
    expect(later.ongoingFrom).toBe('2026-08-01')
    expect(later.cleanup).toEqual(scope.catchUp)
  })
  it('uses the business calendar at month and year boundaries', () => {
    expect(workPeriods(scope, '2027-01-01T02:00:00Z', 'America/Phoenix').recentFrom).toBe('2026-11-01')
    expect(workPeriods(scope, '2027-01-01T08:00:00Z', 'America/Phoenix').recentFrom).toBe('2026-12-01')
  })
  it('does not authorize older selected dates without purchased coverage', () => {
    const p = workPeriods({ ...scope, authorizedStart: '2026-08-01', historicalAuthorized: false }, '2026-09-23T12:00:00Z', 'UTC')
    expect(p.cleanup).toBeNull()
    expect(p.ongoingFrom).toBe('2026-08-01')
  })
  it('respects a later chosen start and unknown scope', () => {
    expect(workPeriods({ ...scope, authorizedStart: '2026-09-01', historicalAuthorized: false }, '2026-09-23', 'UTC').ongoingFrom).toBe('2026-09-01')
    expect(workPeriods({ ...scope, authorizedStart: null }, '2026-09-23', 'UTC').ongoingFrom).toBeNull()
    expect(() => workPeriods(scope, 'invalid', 'UTC')).toThrow('Invalid work clock')
  })
})
