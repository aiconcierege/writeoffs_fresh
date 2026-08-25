import {NextResponse} from 'next/server'
import {createServerSupabase} from '../../../../utils/supabase/server'
import {loadCustomerEntitlements} from '../../../lib/membership/entitlements'

export async function GET(){const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
  try{const snapshot=await loadCustomerEntitlements(supabase);return NextResponse.json({plan:snapshot.plan,lifecycle:snapshot.lifecycle,accessThrough:snapshot.accessThrough,
    graceThrough:snapshot.graceThrough,scheduledPlan:snapshot.scheduledPlan,scheduledEffectiveAt:snapshot.scheduledEffectiveAt,cancelAtPeriodEnd:snapshot.cancelAtPeriodEnd,
    connectedPlaidItemLimit:snapshot.connectedPlaidItemLimit})}catch{return NextResponse.json({error:'Membership could not be loaded.'},{status:503})}}
