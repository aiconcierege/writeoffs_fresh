import {NextResponse} from 'next/server'
import {createServerSupabase} from '../../../../utils/supabase/server'
import {createServerAdminSupabase} from '../../../../utils/supabase/admin'
import {createStripeClient,stripeConfiguration} from '../../../lib/membership/stripe'

export async function POST(){try{const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:'Sign in to manage billing.'},{status:401})
  const business=await supabase.from('businesses').select('id').eq('owner_user_id',user.id).single();if(!business.data)return NextResponse.json({error:'Business membership unavailable.'},{status:404})
  const link=await createServerAdminSupabase().from('membership_provider_links').select('provider_customer_id').eq('business_id',business.data.id).maybeSingle()
  if(!link.data?.provider_customer_id)return NextResponse.json({error:'No Stripe billing profile is available yet.'},{status:409})
  const config=stripeConfiguration();if(!config.portalConfigurationId)throw new Error('STRIPE_PORTAL_NOT_CONFIGURED');const session=await createStripeClient().billingPortal.sessions.create({customer:link.data.provider_customer_id,configuration:config.portalConfigurationId,
    return_url:`${config.baseUrl}/settings/billing`});return NextResponse.json({url:session.url})
}catch{return NextResponse.json({error:'We could not open billing settings. Please try again.'},{status:503})}}
