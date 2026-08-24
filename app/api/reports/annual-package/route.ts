import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { getAuthenticatedTaxYearReadiness, validateTaxYear } from '../../../lib/bookkeeping/tax-year-readiness-service'
import { documentationSummaryCsv, readinessIssuesCsv } from '../../../lib/bookkeeping/tax-year-readiness'

export const runtime = 'nodejs'
export async function GET(request: Request) {
  const supabase = await createServerSupabase()
  try {
    const url = new URL(request.url)
    const year = validateTaxYear(url.searchParams.get('year') ?? new Date().getFullYear())
    const file = url.searchParams.get('file')
    if (!['unresolved-items','documentation'].includes(file ?? '')) {
      return NextResponse.json({ error: 'invalid_file' }, { status: 400 })
    }
    const readiness = await getAuthenticatedTaxYearReadiness({ supabase, taxYear: year })
    const body = file === 'documentation' ? documentationSummaryCsv(readiness) : readinessIssuesCsv(readiness)
    return new NextResponse(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="writeoffs-${year}-${file}.csv"`, 'Cache-Control': 'no-store' } })
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    return NextResponse.json({ error: code === 'AUTH_REQUIRED' ? 'unauthorized' : 'package_unavailable' },
      { status: code === 'AUTH_REQUIRED' ? 401 : 500 })
  }
}
