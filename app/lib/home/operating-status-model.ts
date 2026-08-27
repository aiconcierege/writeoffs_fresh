export type HomeOperatingStatus = {
  hasConnectedAccounts: boolean
  lastSuccessfulAccountCheck: string | null
  checkInWeekday: number | null
  timeZone: string | null
}

export function accountCheckLabel(value: string | null, timeZone: string | null) {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZone: timeZone ?? 'UTC', timeZoneName: 'short',
    }).format(new Date(value))
  } catch { return null }
}

export function checkInDayLabel(weekday: number | null) {
  return weekday == null ? null
    : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday]
}
