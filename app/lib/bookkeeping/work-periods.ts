import type { AuthorizedBookkeepingScope } from './authorized-scope'

/** Scheduling is not commercial authorization. The rolling recent window never
 * extends purchased cleanup or turns covered ongoing work into a new purchase. */
export function workPeriods(scope: AuthorizedBookkeepingScope, asOf: string, timezone: string) {
  const instant = new Date(asOf)
  if (!Number.isFinite(instant.getTime())) throw new Error('Invalid work clock')
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
  }
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]))
  const today = `${parts.year}-${parts.month}-${parts.day}`
  const recentFrom = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 2, 1)).toISOString().slice(0, 10)
  const start = scope.authorizedStart
  // includedStart is established from the joining month, not this clock.
  const ongoingFrom = start && scope.includedStart ? (start > scope.includedStart ? start : scope.includedStart) : null
  const cleanup = start && scope.historicalAuthorized && scope.includedStart && start < scope.includedStart
    ? { from: start, through: new Date(Date.parse(`${scope.includedStart}T00:00:00Z`) - 86400000).toISOString().slice(0, 10) }
    : null
  return { today, recentFrom, ongoingFrom, cleanup }
}
