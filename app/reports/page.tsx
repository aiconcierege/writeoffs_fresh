import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { ReportsSummary } from './ReportsSummary'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <ReportsSummary />
}
