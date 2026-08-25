import {redirect} from 'next/navigation'
import {createServerSupabase} from '../../utils/supabase/server'
import {loadCustomerEntitlements} from '../lib/membership/entitlements'
import {MembershipChooser} from './MembershipChooser'
export const dynamic='force-dynamic'
export default async function MembershipPage(){const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login')
  const membership=await loadCustomerEntitlements(supabase);if(membership.lifecycle!=='none'&&membership.lifecycle!=='expired_read_only')redirect('/settings/billing')
  return <main className="app-page"><section className="page-container page-container-standard"><p className="eyebrow">Membership</p><h1 className="page-title">Choose how WriteOffs should help</h1><p className="page-description max-w-2xl">Both memberships include generous receipt, statement, mileage, deduction, and security tools. Choose Business when you also want WriteOffs to organize income and invoices.</p><MembershipChooser/></section></main>}
