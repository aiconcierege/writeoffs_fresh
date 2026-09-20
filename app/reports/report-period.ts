export type ReportPeriod = 'ytd' | 'month' | 'quarter' | 'annual'

/** UTC calendar dates match the canonical report endpoint; no financial logic. */
export function reportPeriod(kind: ReportPeriod, anchor: string) {
  const date = new Date(`${anchor}T00:00:00Z`)
  const year = date.getUTCFullYear(), month = date.getUTCMonth()
  const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
  const start = kind === 'month' ? day(year, month, 1) : kind === 'quarter' ? day(year, Math.floor(month / 3) * 3, 1) : day(year, 0, 1)
  const end = kind === 'ytd' ? anchor : kind === 'month' ? day(year, month + 1, 0) : kind === 'quarter' ? day(year, Math.floor(month / 3) * 3 + 3, 0) : day(year, 11, 31)
  const format = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
  return { start, end, year, label: `${format(start)} – ${format(end)}` }
}
