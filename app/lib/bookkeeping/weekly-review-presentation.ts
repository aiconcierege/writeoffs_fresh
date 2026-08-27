export function formatReviewActivityDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  }).format(date)
}

function calendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null
}

export function formatReviewPeriod(start: string, end: string) {
  const first = calendarDate(start), last = calendarDate(end)
  if (!first || !last) return `${start}–${end}`
  const month = (value: number) => new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2020, value - 1, 1)))
  if (first.year !== last.year) {
    return `${month(first.month)} ${first.day}, ${first.year}–${month(last.month)} ${last.day}, ${last.year}`
  }
  if (first.month !== last.month) return `${month(first.month)} ${first.day}–${month(last.month)} ${last.day}`
  return `${month(first.month)} ${first.day}–${last.day}`
}

export function reviewTreatmentLabel(input: { role: string; treatment: string }) {
  if (input.role === 'income') return 'Business income'
  return input.treatment === 'mixed_use' ? 'Business + personal' : 'Business'
}

/** A missing or ambiguous canonical category stays absent; internal keys are never a display fallback. */
export function reviewCategoryLabel(categoryKeys: Array<string | null | undefined>, labels: Record<string, string>) {
  const keys = [...new Set(categoryKeys.filter((key): key is string => Boolean(key)))]
  if (keys.length !== 1) return null
  const label = labels[keys[0]]?.trim()
  return label || null
}
