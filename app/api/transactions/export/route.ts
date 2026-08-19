import { NextResponse } from 'next/server'
import { getAuthenticatedContext, unauthorizedResponse } from '../../../lib/auth/require-user'
import { getAuthenticatedCanonicalReport } from '../../../lib/bookkeeping/reporting-service'
import { canonicalReportCsv } from '../../../lib/bookkeeping/reporting-export'

export async function GET(request: Request) {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return unauthorizedResponse()
  const yearParam = new URL(request.url).searchParams.get('year')
  const today = new Date().toISOString().slice(0, 10)
  const allYears = yearParam?.toLowerCase() === 'all'
  const year = /^\d{4}$/.test(yearParam ?? '') ? yearParam! : today.slice(0, 4)
  const report = await getAuthenticatedCanonicalReport({ supabase,
    periodStart: allYears ? '0001-01-01' : `${year}-01-01`,
    periodEnd: allYears || year === today.slice(0, 4) ? today : `${year}-12-31` })
  return new NextResponse(canonicalReportCsv(report), { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="writeoffs-transactions-${allYears ? 'all' : year}.csv"`, 'Cache-Control': 'no-store',
  } })
}
