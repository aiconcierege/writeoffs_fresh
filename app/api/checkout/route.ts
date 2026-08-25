import {NextResponse} from 'next/server'
import {createServerSupabase} from '../../../utils/supabase/server'
import {createServerAdminSupabase} from '../../../utils/supabase/admin'
import {createStripeClient,stripeConfiguration,stripePlanMetadata} from '../../lib/membership/stripe'
import {stripePriceForPlan} from '../../lib/membership/plans'
import type {MembershipPlan} from '../../lib/membership/entitlements'

export const runtime='nodejs'

export async function POST(request:Request){try{const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'Sign in to choose a membership.'},{status:401})
  const business=await supabase.from('businesses').select('id,name,contact_email').eq('owner_user_id',user.id).single()
  if(business.error||!business.data)return NextResponse.json({error:'Finish business setup before choosing a membership.'},{status:409})
  const body=await request.json().catch(()=>null) as{plan?:unknown;requestKey?:unknown}|null
  if(!body||(body.plan!=='expenses'&&body.plan!=='business')||typeof body.requestKey!=='string'||body.requestKey.length<8||body.requestKey.length>200)
    return NextResponse.json({error:'Choose a valid membership.'},{status:400})
  const plan=body.plan as MembershipPlan,admin=createServerAdminSupabase(),stripe=createStripeClient(),config=stripeConfiguration()
  const [existing,current]=await Promise.all([admin.from('membership_provider_links').select('provider_customer_id,provider_subscription_id').eq('business_id',business.data.id).maybeSingle(),admin.from('business_memberships').select('lifecycle').eq('business_id',business.data.id).maybeSingle()])
  if(existing.data?.provider_subscription_id&&current.data?.lifecycle!=='expired_read_only')return NextResponse.json({error:'Use membership settings to change your current plan.'},{status:409})
  if(existing.data?.provider_subscription_id&&current.data?.lifecycle==='expired_read_only')await admin.from('membership_provider_links').update({provider_subscription_id:null,updated_at:new Date().toISOString()}).eq('business_id',business.data.id)
  let customerId=existing.data?.provider_customer_id as string|undefined
  if(!customerId){const customer=await stripe.customers.create({email:user.email??business.data.contact_email??undefined,name:business.data.name,
      metadata:{business_id:business.data.id}},{idempotencyKey:`writeoffs-customer-${business.data.id}`});customerId=customer.id
    const linked=await admin.from('membership_provider_links').insert({business_id:business.data.id,provider_customer_id:customerId})
    if(linked.error&&linked.error.code!=='23505')throw new Error('CUSTOMER_MAPPING_FAILED')}
  const metadata=stripePlanMetadata(business.data.id,plan),session=await stripe.checkout.sessions.create({mode:'subscription',customer:customerId,
    line_items:[{price:stripePriceForPlan(plan),quantity:1}],allow_promotion_codes:process.env.STRIPE_ALLOW_PROMOTION_CODES==='true',
    billing_address_collection:'auto',automatic_tax:{enabled:process.env.STRIPE_TAX_ENABLED==='true'},metadata,subscription_data:{metadata},
    success_url:`${config.baseUrl}/settings/billing?checkout=processing`,cancel_url:`${config.baseUrl}/membership?checkout=canceled`},
    {idempotencyKey:`writeoffs-checkout-${business.data.id}-${body.requestKey}`})
  if(!session.url)throw new Error('CHECKOUT_URL_UNAVAILABLE');return NextResponse.json({url:session.url})
}catch{return NextResponse.json({error:'We could not start checkout. Please try again.'},{status:503})}}
