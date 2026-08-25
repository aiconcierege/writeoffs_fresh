import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { ReportsSummary } from './ReportsSummary'
import {loadCustomerEntitlements} from '../lib/membership/entitlements'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const membership=await loadCustomerEntitlements(supabase)
  if(membership.lifecycle==='none')redirect('/membership')
  return <ReportsSummary scope={membership.plan??'expenses'} readOnly={membership.lifecycle==='expired_read_only'} />
}
