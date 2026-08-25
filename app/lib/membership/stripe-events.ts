import 'server-only'

import type Stripe from 'stripe'
import type {SupabaseClient} from '@supabase/supabase-js'
import {membershipGraceDays,providerCustomerId,subscriptionPeriodEnd,subscriptionPlan} from './stripe'
import type {MembershipLifecycle,MembershipPlan} from './entitlements'

type ApplyInput={event:Stripe.Event;stripe:Stripe;admin:SupabaseClient}
const iso=(seconds:number)=>new Date(seconds*1000).toISOString()

async function businessFor(input:{admin:SupabaseClient;customerId:string;metadata?:Record<string,string>}){const id=input.metadata?.business_id
  const link=await input.admin.from('membership_provider_links').select('business_id').eq('provider_customer_id',input.customerId).maybeSingle()
  if(id){const found=await input.admin.from('businesses').select('id').eq('id',id).maybeSingle();if(found.data){if(link.data?.business_id&&String(link.data.business_id)!==String(found.data.id))throw new Error('STRIPE_CUSTOMER_BUSINESS_MISMATCH');return String(found.data.id)}}
  return link.data?.business_id?String(link.data.business_id):null}

export function stripeLifecycleFor(subscription:Pick<Stripe.Subscription,'status'|'cancel_at_period_end'>,eventType:string):MembershipLifecycle{if(eventType==='customer.subscription.deleted'||['canceled','incomplete_expired'].includes(subscription.status))return'expired_read_only'
  if(subscription.cancel_at_period_end)return'canceling';if(['past_due','unpaid','incomplete','paused'].includes(subscription.status))return'payment_issue';return'active'}
export function membershipEventTypeFor(lifecycle:MembershipLifecycle,prior:{plan?:string;lifecycle?:string}|null,plan:MembershipPlan){
  if(lifecycle==='expired_read_only')return'expired';if(lifecycle==='payment_issue')return'payment_failed';if(lifecycle==='canceling')return'cancellation_requested'
  if(prior?.lifecycle==='payment_issue')return'payment_recovered';if(prior?.lifecycle==='canceling')return'cancellation_reversed'
  if(prior?.plan==='expenses'&&plan==='business')return'plan_upgraded';if(prior?.plan==='business'&&plan==='expenses')return'downgrade_applied'
  return prior?'provider_synced':'activated'}

export async function applyStripeEvent({event,stripe,admin}:ApplyInput){let subscription:Stripe.Subscription|null=null,customerId='',metadata:Record<string,string>={}
  if(event.type==='checkout.session.completed'){const session=event.data.object as Stripe.Checkout.Session;customerId=typeof session.customer==='string'?session.customer:session.customer?.id??'';metadata=session.metadata??{}
    const subscriptionId=typeof session.subscription==='string'?session.subscription:session.subscription?.id;if(!subscriptionId)throw new Error('STRIPE_SUBSCRIPTION_UNAVAILABLE');subscription=await stripe.subscriptions.retrieve(subscriptionId)}
  else if(event.type.startsWith('customer.subscription.')){const delivered=event.data.object as Stripe.Subscription
    subscription=event.type==='customer.subscription.deleted'?delivered:await stripe.subscriptions.retrieve(delivered.id)
    customerId=providerCustomerId(subscription.customer);metadata=subscription.metadata}
  else if(event.type==='invoice.paid'||event.type==='invoice.payment_failed'){const invoice=event.data.object as Stripe.Invoice;customerId=typeof invoice.customer==='string'?invoice.customer:invoice.customer?.id??''
    const parent=invoice.parent?.subscription_details?.subscription,subscriptionId=typeof parent==='string'?parent:parent?.id;if(!subscriptionId)throw new Error('STRIPE_SUBSCRIPTION_UNAVAILABLE');subscription=await stripe.subscriptions.retrieve(subscriptionId);metadata=subscription.metadata}
  else return'ignored'
  const businessId=await businessFor({admin,customerId,metadata});if(!businessId)throw new Error('STRIPE_BUSINESS_UNRESOLVED')
  const providerLink=await admin.from('membership_provider_links').select('provider_subscription_id').eq('business_id',businessId).maybeSingle()
  if(providerLink.data?.provider_subscription_id&&providerLink.data.provider_subscription_id!==subscription.id){if(event.type==='customer.subscription.deleted')return'ignored_superseded_subscription';throw new Error('STRIPE_MULTIPLE_SUBSCRIPTIONS')}
  const plan=subscriptionPlan(subscription);if(!plan)throw new Error('STRIPE_PLAN_UNRESOLVED')
  const current=await admin.from('business_memberships').select('plan,lifecycle,scheduled_plan,scheduled_effective_at').eq('business_id',businessId).maybeSingle()
  const lifecycle=stripeLifecycleFor(subscription,event.type)
  const periodEnd=subscriptionPeriodEnd(subscription),grace=lifecycle==='payment_issue'?new Date(event.created*1000+membershipGraceDays()*86400000).toISOString():null
  const scheduledApplied=current.data?.scheduled_plan===plan
  const result=await admin.rpc('apply_stripe_membership_event',{p_stripe_event_id:event.id,p_event_type:event.type,p_provider_created_at:iso(event.created),
    p_business_id:businessId,p_customer_id:customerId,p_subscription_id:subscription.id,p_plan:plan,p_lifecycle:lifecycle,p_access_through:periodEnd,
    p_grace_through:grace,p_cancel_at_period_end:subscription.cancel_at_period_end,p_scheduled_plan:scheduledApplied?null:current.data?.scheduled_plan??null,
    p_scheduled_effective_at:scheduledApplied?null:current.data?.scheduled_effective_at??null,p_membership_event_type:membershipEventTypeFor(lifecycle,current.data,plan)})
  if(result.error)throw new Error('STRIPE_MEMBERSHIP_APPLY_FAILED');return String(result.data)
}
