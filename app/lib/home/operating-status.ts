import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { HomeOperatingStatus } from './operating-status-model'

type Row = Record<string, unknown>

export async function getHomeOperatingStatus(supabase: SupabaseClient): Promise<HomeOperatingStatus> {
  const [connections, cadence] = await Promise.all([
    supabase.rpc('list_plaid_connections'),
    supabase.from('current_business_review_cadence')
      .select('check_in_weekday,timezone_name').maybeSingle(),
  ])
  const rows = connections.error ? [] : (connections.data ?? []) as Row[]
  const connected = rows.filter((row) => row.connection_status !== 'disconnected'
    && row.consent_status !== 'disconnected' && row.consent_status !== 'revoked')
  const successfulChecks = connected.map((row) => row.last_successful_sync_at)
    .filter((value): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left))
  const weekday = cadence.error ? null : Number(cadence.data?.check_in_weekday)
  const timeZone = cadence.error || typeof cadence.data?.timezone_name !== 'string'
    ? null : cadence.data.timezone_name

  return {
    hasConnectedAccounts: connected.length > 0,
    lastSuccessfulAccountCheck: successfulChecks[0] ?? null,
    checkInWeekday: weekday != null && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
      ? weekday : null,
    timeZone,
  }
}
