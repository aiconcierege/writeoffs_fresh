import { describe, expect, it } from 'vitest'
import { latestCheckInOnOrBefore, nextReviewPeriod, reviewPeriodForCheckIn } from '../../app/lib/bookkeeping/review-cadence'

describe('Business-selected weekly review cadence', () => {
  it('creates date-only periods ending before the chosen check-in day', () => {
    expect(reviewPeriodForCheckIn('2026-08-28', 5)).toEqual({
      periodStart: '2026-08-21', periodEnd: '2026-08-27', checkInDate: '2026-08-28',
    })
  })

  it('finds deterministic boundaries for any chosen weekday', () => {
    expect(latestCheckInOnOrBefore('2026-08-26', 1)).toBe('2026-08-24')
    expect(latestCheckInOnOrBefore('2026-08-26', 6)).toBe('2026-08-22')
  })

  it('uses the prior immutable boundary when a future check-in day changes', () => {
    expect(nextReviewPeriod({ checkInDate: '2026-09-02', checkInWeekday: 3,
      previousPeriodEnd: '2026-08-27' })).toEqual({
      periodStart: '2026-08-28', periodEnd: '2026-09-01', checkInDate: '2026-09-02',
    })
  })
})
