import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { getAuthenticatedCanonicalReport } from '../../../lib/bookkeeping/reporting-service'

const isoDate = /^\d{4}-\d{2}-\d{2}$/
function validDate(value: string) {
  if (!isoDate.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

export async function GET(request: Request) {
  const supabase = await createServerSupabase()
  const url = new URL(request.url)
  const today = new Date().toISOString().slice(0, 10)
  const periodStart = url.searchParams.get('start') ?? `${today.slice(0, 4)}-01-01`
  const periodEnd = url.searchParams.get('end') ?? today
  if (!validDate(periodStart) || !validDate(periodEnd) || periodStart > periodEnd) {
    return NextResponse.json({ error: 'invalid_period' }, { status: 400 })
  }
  try {
    return NextResponse.json(await getAuthenticatedCanonicalReport({ supabase, periodStart, periodEnd }))
  } catch (error) {
    if (error instanceof Error && /authenticated user/i.test(error.message)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'report_unavailable' }, { status: 500 })
  }
}
