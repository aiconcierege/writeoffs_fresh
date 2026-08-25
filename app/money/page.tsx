import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { listManualMoney } from '../lib/manual-money/repository'
import { ManualMoneyClient } from './ManualMoneyClient'
import {can,loadCustomerEntitlements} from '../lib/membership/entitlements'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const context = await listManualMoney(supabase)
  const kind = (await searchParams).kind === 'spent' ? 'spent' : 'received'
  const membership=await loadCustomerEntitlements(supabase)
  if(membership.lifecycle==='none')redirect('/membership')
  if(membership.lifecycle==='expired_read_only')redirect('/membership/read-only')
  if(kind==='received'&&!can(membership,'record_manual_income'))return <main className="app-page"><section className="page-container page-container-narrow"><p className="eyebrow">WriteOffs Business</p><h1 className="page-title">Income tracking is available with Business.</h1><p className="page-description">Expenses keeps spending, deductions, mileage, and documentation organized. Business also organizes money received and invoices.</p><Link className="btn btn-primary mt-7 inline-flex" href="/settings/billing">See membership options</Link></section></main>
  return <ManualMoneyClient initialActivities={context.activities} initialDirection={kind} />
}
