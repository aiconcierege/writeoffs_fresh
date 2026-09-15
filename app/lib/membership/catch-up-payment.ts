import 'server-only'
import type Stripe from 'stripe'
import type {SupabaseClient} from '@supabase/supabase-js'
/** Called only after Stripe's signature has been verified. Never trust a redirect. */
export async function confirmCatchUpPayment(session:Stripe.Checkout.Session,stripe:Stripe,admin:SupabaseClient) {
  if(session.livemode||session.mode!=='payment'||session.metadata?.purpose!=='historical_catch_up')return 'ignored'
  const current=await stripe.checkout.sessions.retrieve(session.id,{expand:['line_items']})
  if(current.payment_status!=='paid')return 'awaiting_payment'
  const order=await admin.from('customer_catch_up_orders').select('*').eq('id',current.metadata?.order_id??'').single()
  if(order.error)throw new Error('CATCH_UP_ORDER_UNAVAILABLE')
  const link=await admin.from('membership_provider_links').select('provider_customer_id').eq('business_id',order.data.business_id).single()
  const customer=typeof current.customer==='string'?current.customer:current.customer?.id
  const items=current.line_items?.data??[]
  if(link.error||customer!==link.data.provider_customer_id||current.metadata?.business_id!==order.data.business_id
    ||current.currency!=='usd'||current.amount_total!==order.data.amount_cents||items.length!==1
    ||items[0].price?.id!==process.env.STRIPE_CATCH_UP_PRICE_ID||items[0].quantity!==order.data.additional_months)
    throw new Error('CATCH_UP_PAYMENT_MISMATCH')
  const result=await admin.rpc('confirm_customer_catch_up_payment',{p_order_id:order.data.id,p_session_id:current.id,p_amount:current.amount_total})
  if(result.error)throw new Error('CATCH_UP_APPLY_FAILED')
  return 'catch_up_paid'
}
