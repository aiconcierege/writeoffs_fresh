export type WeeklyReviewCadence = { checkInWeekday: number; effectiveFrom: string }

const DAY_MS = 86_400_000

function isoDate(date: Date) { return date.toISOString().slice(0, 10) }
function date(value: string) { return new Date(`${value}T00:00:00.000Z`) }

/** A check-in on weekday D reviews the seven dates ending the day before D. */
export function reviewPeriodForCheckIn(checkInDate: string, checkInWeekday: number) {
  const endExclusive = date(checkInDate)
  if (endExclusive.getUTCDay() !== checkInWeekday) throw new Error('Check-in date does not match cadence.')
  return {
    periodStart: isoDate(new Date(endExclusive.getTime() - 7 * DAY_MS)),
    periodEnd: isoDate(new Date(endExclusive.getTime() - DAY_MS)),
    checkInDate,
  }
}

export function nextReviewPeriod(input: {
  checkInDate: string
  checkInWeekday: number
  previousPeriodEnd?: string | null
}) {
  const standard = reviewPeriodForCheckIn(input.checkInDate, input.checkInWeekday)
  if (!input.previousPeriodEnd) return standard
  const start = date(input.previousPeriodEnd)
  start.setUTCDate(start.getUTCDate() + 1)
  const periodStart = isoDate(start)
  if (periodStart > standard.periodEnd) throw new Error('Review cadence would create an empty period.')
  return { ...standard, periodStart }
}

export function latestCheckInOnOrBefore(asOf: string, checkInWeekday: number) {
  if (!Number.isInteger(checkInWeekday) || checkInWeekday < 0 || checkInWeekday > 6) {
    throw new Error('Check-in weekday must be between Sunday and Saturday.')
  }
  const candidate = date(asOf)
  const difference = (candidate.getUTCDay() - checkInWeekday + 7) % 7
  candidate.setUTCDate(candidate.getUTCDate() - difference)
  return isoDate(candidate)
}
