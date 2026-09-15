/** Calendar-month pricing, independent of browser timezone and day length. */
export const CATCH_UP_MONTH_CENTS = 2000
export function monthIndex(month: string): number {
  if (!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid starting month.')
  const [year, value] = month.split('-').map(Number)
  return year * 12 + value - 1
}
export function monthAt(index: number): string {
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`
}
export function catchUpQuote(startMonth: string, joinedMonth: string) {
  const start = monthIndex(startMonth), joined = monthIndex(joinedMonth)
  if (start > joined) throw new Error('Choose this month or an earlier month.')
  const additionalMonths = Math.max(0, joined - 1 - start)
  return { startMonth, joinedMonth, includedFrom: monthAt(joined - 1), additionalMonths,
    monthPriceCents: CATCH_UP_MONTH_CENTS, totalCents: additionalMonths * CATCH_UP_MONTH_CENTS }
}
export function displayMonth(month: string) {
  monthIndex(month)
  return new Intl.DateTimeFormat('en-US', {month:'long',year:'numeric',timeZone:'UTC'})
    .format(new Date(`${month}-01T00:00:00Z`))
}
