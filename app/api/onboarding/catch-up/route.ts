import {NextResponse} from 'next/server'
import {createServerSupabase} from '../../../../utils/supabase/server'
import {createServerAdminSupabase} from '../../../../utils/supabase/admin'
import {createStripeClient,stripeConfiguration} from '../../../lib/membership/stripe'
import {catchUpCheckout,retireCatchUpCheckout} from '../../../lib/membership/catch-up-checkout'
import {monthIndex} from '../../../lib/onboarding/catch-up'
export async function POST(request:Request) {
 const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser()
 if(!user)return NextResponse.json({error:'Please sign in.'},{status:401})
 const body=await request.json().catch(()=>null)
 try {monthIndex(body?.startMonth)}catch{return NextResponse.json({error:'Choose a starting month.'},{status:400})}
 const parameters={p_start_month:`${body.startMonth}-01`,p_agreed:false,p_confirm:false,p_expected_amount:null as number|null}
 // This RPC enforces verified ownership, active membership and deletion restrictions.
 const preview=await supabase.rpc('choose_customer_start_month',parameters)
 if(preview.error)return NextResponse.json({error:'We couldn’t confirm this starting month. Refresh and try again.'},{status:409})
 if(body.preview===true)return NextResponse.json(preview.data)
 if(!preview.data.ready&&(body.agreed!==true||body.expectedTotalCents!==preview.data.totalCents))
  return NextResponse.json({error:'Review the catch-up charge and agree before continuing.'},{status:409})
 try {
  const business=await supabase.from('businesses').select('id').eq('owner_user_id',user.id).single()
  if(business.error)throw new Error('BUSINESS_UNAVAILABLE')
  const admin=createServerAdminSupabase()
  const pending=await admin.from('customer_catch_up_orders').select('*').eq('business_id',business.data.id).is('paid_at',null).is('canceled_at',null).neq('start_month',parameters.p_start_month)
  if(pending.error)throw new Error('ORDER_UNAVAILABLE')
  let checkout: {stripe:ReturnType<typeof createStripeClient>;customer:string;price:string;baseUrl:string}|undefined
  if(!preview.data.ready||pending.data.length){
   const config=stripeConfiguration()
   if(process.env.WRITEOFFS_ENVIRONMENT!=='staging'||config.mode!=='test')throw new Error('SANDBOX_REQUIRED')
   const stripe=createStripeClient(),price=process.env.STRIPE_CATCH_UP_PRICE_ID
   if(!price)throw new Error('PRICE_UNAVAILABLE')
   const configuredPrice=await stripe.prices.retrieve(price)
   if(configuredPrice.livemode||configuredPrice.currency!=='usd'||configuredPrice.unit_amount!==2000||configuredPrice.recurring)throw new Error('PRICE_MISMATCH')
   const link=await admin.from('membership_provider_links').select('provider_customer_id').eq('business_id',business.data.id).single()
   if(link.error)throw new Error('CUSTOMER_UNAVAILABLE')
   checkout={stripe,customer:link.data.provider_customer_id,price,baseUrl:config.baseUrl}
   for(const order of pending.data)await retireCatchUpCheckout({...checkout,admin,order})
  }
  const confirmed=await supabase.rpc('choose_customer_start_month',{...parameters,p_agreed:body.agreed===true,p_confirm:true,p_expected_amount:Number.isSafeInteger(body.expectedTotalCents)?body.expectedTotalCents:null})
  if(confirmed.error)return NextResponse.json({error:'Your starting period changed. Refresh to review the current price.'},{status:409})
  const data=confirmed.data
  if(data.ready||!data.orderId)return NextResponse.json(data)
  if(!checkout)throw new Error('CHECKOUT_UNAVAILABLE')
  const order=await admin.from('customer_catch_up_orders').select('*').eq('id',data.orderId).eq('business_id',business.data.id).is('canceled_at',null).single()
  if(order.error)throw new Error('ORDER_UNAVAILABLE')
  const session=await catchUpCheckout({...checkout,admin,order:order.data})
  if(session.status==='complete')return NextResponse.json({error:'Your payment is being confirmed. Refresh in a moment.'},{status:409})
  if(!session.url)throw new Error('SESSION_UNAVAILABLE')
  return NextResponse.json({...data,url:session.url})
 }catch{return NextResponse.json({error:'We couldn’t open secure checkout. If you just paid, wait a moment and refresh. Otherwise, please try again.'},{status:503})}
}
