import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { plaidIsConfigured, plaidSandboxLinkEnabled } from '../lib/plaid/config'
import { GetStartedFlow } from './GetStartedFlow'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function GetStartedPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const [{ data: connections }, { data: accounts }, { data: cadence }] = await Promise.all([
    supabase.rpc('list_plaid_connections'), supabase.rpc('list_plaid_connection_accounts'),
    supabase.from('current_business_review_cadence').select('check_in_weekday').maybeSingle(),
  ])
  return <main className="app-page"><div className="page-container page-container-narrow">
    <GetStartedFlow enabled={plaidIsConfigured()&&plaidSandboxLinkEnabled()} initialCheckInWeekday={cadence?.check_in_weekday??null}
      connections={connections??[]} accounts={accounts??[]}/>
  </div></main>
}
