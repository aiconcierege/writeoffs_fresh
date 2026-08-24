import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { getAuthenticatedTaxYearReadiness, validateTaxYear } from '../../../lib/bookkeeping/tax-year-readiness-service'

export const runtime = 'nodejs'
export async function GET(request: Request) {
  const supabase = await createServerSupabase()
  try {
    const year = validateTaxYear(new URL(request.url).searchParams.get('year') ?? new Date().getFullYear())
    return NextResponse.json(await getAuthenticatedTaxYearReadiness({ supabase, taxYear: year }),
      { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    return NextResponse.json({ error: code === 'AUTH_REQUIRED' ? 'unauthorized'
      : code === 'INVALID_TAX_YEAR' ? 'invalid_tax_year' : 'readiness_unavailable' },
    { status: code === 'AUTH_REQUIRED' ? 401 : code === 'INVALID_TAX_YEAR' ? 400 : 500 })
  }
}
