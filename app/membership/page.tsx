import {redirect} from 'next/navigation'
import {createServerSupabase} from '../../utils/supabase/server'
import {loadCustomerEntitlements} from '../lib/membership/entitlements'
import {MembershipChooser} from './MembershipChooser'
export const dynamic='force-dynamic'
export default async function MembershipPage(){const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login')
  const membership=await loadCustomerEntitlements(supabase);if(membership.lifecycle!=='none'&&membership.lifecycle!=='expired_read_only')redirect('/settings/billing')
  return <main className="app-page"><section className="page-container page-container-narrow"><p className="eyebrow">Membership</p><h1 className="page-title">Simple bookkeeping. One simple price.</h1><p className="page-description max-w-2xl">One WriteOffs membership, with everything you need to keep your business books organized.</p><MembershipChooser/></section></main>}
