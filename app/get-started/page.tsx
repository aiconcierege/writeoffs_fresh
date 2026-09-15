import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { plaidEnvironment, plaidLinkEnabled } from '../lib/plaid/config'
import { GetStartedFlow } from './GetStartedFlow'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function GetStartedPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const [{ data: connections }, { data: accounts }, { data: accountUses }] = await Promise.all([
    supabase.rpc('list_plaid_connections'), supabase.rpc('list_plaid_connection_accounts'),
    supabase.from('current_financial_account_use')
      .select('id,financial_account_id,designation,effective_at'),
  ])
  return <main className="app-page"><div className="page-container page-container-narrow">
    <GetStartedFlow enabled={plaidLinkEnabled()} sandbox={plaidEnvironment()==='sandbox'}
      connections={connections??[]} accounts={accounts??[]} accountUses={accountUses??[]}/>
  </div></main>
}
