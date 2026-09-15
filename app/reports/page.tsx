import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { TaxTimeReadiness } from './TaxTimeReadiness'
import { getAuthenticatedTaxYearReadiness } from '../lib/bookkeeping/tax-year-readiness-service'
import { ReportsSummary } from './ReportsSummary'
import {loadCustomerEntitlements} from '../lib/membership/entitlements'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const membership=await loadCustomerEntitlements(supabase)
  if(membership.lifecycle==='none')redirect('/membership')
  const readOnly = ['expired_read_only', 'pending_deletion'].includes(membership.lifecycle)
  const readiness = await getAuthenticatedTaxYearReadiness({ supabase, taxYear: new Date().getFullYear() - 1,
    scope: membership.plan ?? 'expenses', includeDataSourceHealth: !readOnly })
  return <ReportsSummary scope={membership.plan??'expenses'} readOnly={readOnly} annual={<TaxTimeReadiness readiness={readiness} />} />
}
