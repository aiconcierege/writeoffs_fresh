import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { getAuthenticatedTaxYearReadiness, validateTaxYear } from '../../../lib/bookkeeping/tax-year-readiness-service'
import { createTaxTimeReportPdf } from '../../../lib/bookkeeping/tax-time-report-pdf'
import { loadCustomerEntitlements } from '../../../lib/membership/entitlements'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const supabase = await createServerSupabase()
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('AUTH_REQUIRED')
    const params = new URL(request.url).searchParams
    if ([...params.keys()].some(key => key !== 'year')) return NextResponse.json({ error: 'invalid_report_parameters' }, { status: 400 })
    const year = validateTaxYear(new URL(request.url).searchParams.get('year') ?? new Date().getFullYear())
    const membership = await loadCustomerEntitlements(supabase)
    if (!membership.plan || membership.lifecycle === 'none') throw new Error('MEMBERSHIP_REQUIRED')
    const readiness = await getAuthenticatedTaxYearReadiness({ supabase, taxYear: year, scope: membership.plan,
      includeDataSourceHealth: !['expired_read_only','pending_deletion'].includes(membership.lifecycle) })
    if (readiness.status !== 'ready') return NextResponse.json({ error: 'books_not_ready' }, { status: 409 })
    const bytes = await createTaxTimeReportPdf({ readiness })
    return new NextResponse(Buffer.from(bytes), { headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="WriteOffs-${year}-Tax-Time-Report.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } })
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    return NextResponse.json({ error: code === 'AUTH_REQUIRED' ? 'unauthorized'
      : code === 'INVALID_TAX_YEAR' ? 'invalid_tax_year'
        : code === 'MEMBERSHIP_REQUIRED' ? 'membership_required' : 'report_unavailable' },
    { status: code === 'AUTH_REQUIRED' ? 401 : code === 'INVALID_TAX_YEAR' ? 400 : code === 'MEMBERSHIP_REQUIRED' ? 403 : 500 })
  }
}
