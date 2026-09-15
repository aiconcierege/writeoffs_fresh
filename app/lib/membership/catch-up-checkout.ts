import 'server-only'
import type Stripe from 'stripe'
import type {SupabaseClient} from '@supabase/supabase-js'
export type CatchUpOrder={id:string;business_id:string;additional_months:number;provider_session_id:string|null}
/** A retry reuses an open checkout; an expired checkout gets one new generation. */
export async function catchUpCheckout(input:{stripe:Stripe;admin:SupabaseClient;order:CatchUpOrder;customer:string;price:string;baseUrl:string}) {
 const {stripe,admin,order,customer,price,baseUrl}=input
 if(order.provider_session_id){
  const existing=await stripe.checkout.sessions.retrieve(order.provider_session_id)
  if(existing.status!=='expired')return existing
 }
 const session=await stripe.checkout.sessions.create({mode:'payment',customer,payment_method_types:['card'],
  line_items:[{price,quantity:order.additional_months}],
  metadata:{purpose:'historical_catch_up',order_id:order.id,business_id:order.business_id},
  success_url:`${baseUrl}/onboarding?catch_up=processing`,cancel_url:`${baseUrl}/onboarding?catch_up=canceled`},
  {idempotencyKey:order.provider_session_id?`catch-up-${order.id}-${order.provider_session_id}`:`catch-up-${order.id}`})
 let update=admin.from('customer_catch_up_orders').update({provider_session_id:session.id}).eq('id',order.id).is('paid_at',null).is('canceled_at',null)
 update=order.provider_session_id?update.eq('provider_session_id',order.provider_session_id):update.is('provider_session_id',null)
 const saved=await update.select('provider_session_id')
 if(saved.error)throw new Error('CHECKOUT_SAVE_FAILED')
 if(!saved.data?.length){
  const current=await admin.from('customer_catch_up_orders').select('provider_session_id,paid_at,canceled_at').eq('id',order.id).single()
  if(current.error||current.data.canceled_at||current.data.provider_session_id!==session.id)throw new Error('CHECKOUT_CHANGED')
 }
 return session
}
/** Expire the previous payment page before allowing a different starting month. */
export async function retireCatchUpCheckout(input:Parameters<typeof catchUpCheckout>[0]) {
 const session=await catchUpCheckout(input)
 if(session.status==='complete'||session.payment_status==='paid')throw new Error('PAYMENT_PROCESSING')
 if(session.status==='open')await input.stripe.checkout.sessions.expire(session.id)
 const result=await input.admin.from('customer_catch_up_orders').update({canceled_at:new Date().toISOString()})
  .eq('id',input.order.id).eq('provider_session_id',session.id).is('paid_at',null).is('canceled_at',null).select('id')
 if(result.error||!result.data?.length)throw new Error('CHECKOUT_CHANGED')
}
