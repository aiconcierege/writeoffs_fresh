import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { getAuthenticatedTaxYearReadiness, validateTaxYear } from '../../../lib/bookkeeping/tax-year-readiness-service'
import {loadCustomerEntitlements} from '../../../lib/membership/entitlements'

export const runtime = 'nodejs'
export async function GET(request: Request) {
  const supabase = await createServerSupabase()
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('AUTH_REQUIRED')
    const year = validateTaxYear(new URL(request.url).searchParams.get('year') ?? new Date().getFullYear())
    const membership=await loadCustomerEntitlements(supabase);if(!membership.plan)throw new Error('MEMBERSHIP_REQUIRED')
    return NextResponse.json(await getAuthenticatedTaxYearReadiness({ supabase, taxYear: year,scope:membership.plan,
      includeDataSourceHealth: !['expired_read_only','pending_deletion'].includes(membership.lifecycle) }),
      { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    return NextResponse.json({ error: code === 'AUTH_REQUIRED' ? 'unauthorized'
      : code === 'INVALID_TAX_YEAR' ? 'invalid_tax_year'
        : code === 'MEMBERSHIP_REQUIRED' ? 'membership_required' : 'readiness_unavailable' },
    { status: code === 'AUTH_REQUIRED' ? 401 : code === 'INVALID_TAX_YEAR' ? 400 : code === 'MEMBERSHIP_REQUIRED' ? 403 : 500 })
  }
}
