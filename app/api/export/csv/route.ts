import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { getAuthenticatedCanonicalReport } from '../../../lib/bookkeeping/reporting-service'
import { canonicalReportCsv } from '../../../lib/bookkeeping/reporting-export'

export async function GET(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const today = new Date().toISOString().slice(0, 10)
  const url = new URL(request.url)
  const requestedYear = url.searchParams.get('year')
  const year = requestedYear == null ? null : Number(requestedYear)
  if (year != null && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
    return NextResponse.json({ error: 'invalid_year' }, { status: 400 })
  }
  const report = await getAuthenticatedCanonicalReport({ supabase,
    periodStart: year == null ? '0001-01-01' : `${year}-01-01`,
    periodEnd: year == null ? today : `${year}-12-31` })
  const unresolvedOnly = url.searchParams.get('scope') === 'uncategorized'
  return new NextResponse(canonicalReportCsv(report, unresolvedOnly), { headers: {
    'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="writeoffs-${year ?? 'all'}-${unresolvedOnly ? 'needs-attention' : 'activity'}.csv"`,
    'Cache-Control': 'no-store',
  } })
}
