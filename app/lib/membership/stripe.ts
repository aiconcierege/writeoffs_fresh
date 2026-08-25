import 'server-only'

import Stripe from 'stripe'
import {membershipPlans,planFromPriceId,stripePriceForPlan} from './plans'
import type {MembershipPlan} from './entitlements'

function safeBaseUrl(value:string){let url:URL;try{url=new URL(value)}catch{throw new Error('STRIPE_RETURN_URL_INVALID')}
  if(url.pathname!=='/'||url.search||url.hash)throw new Error('STRIPE_RETURN_URL_INVALID')
  const local=['localhost','127.0.0.1'].includes(url.hostname);if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))throw new Error('STRIPE_RETURN_URL_INVALID')
  return url.origin}
export function stripeConfiguration(){const mode=process.env.WRITEOFFS_STRIPE_MODE??'test',key=process.env.STRIPE_SECRET_KEY
  if(!['test','live'].includes(mode))throw new Error('STRIPE_MODE_INVALID')
  if(!key)throw new Error('STRIPE_NOT_CONFIGURED')
  if(mode==='test'&&!key.startsWith('sk_test_'))throw new Error('STRIPE_TEST_KEY_REQUIRED')
  if(mode==='live'&&!key.startsWith('sk_live_'))throw new Error('STRIPE_LIVE_KEY_REQUIRED')
  if((process.env.WRITEOFFS_ENVIRONMENT??'local')!=='production'&&mode==='live')throw new Error('STRIPE_LIVE_FORBIDDEN')
  stripePriceForPlan('expenses');stripePriceForPlan('business')
  return{mode,key,webhookSecret:process.env.STRIPE_WEBHOOK_SECRET??'',portalConfigurationId:process.env.STRIPE_PORTAL_CONFIGURATION_ID??'',baseUrl:safeBaseUrl(process.env.NEXT_PUBLIC_BASE_URL??'http://localhost:3000')}
}

export function createStripeClient(){return new Stripe(stripeConfiguration().key)}
export function membershipGraceDays(){const value=Number(process.env.MEMBERSHIP_PAYMENT_GRACE_DAYS);return Number.isInteger(value)&&value>=1&&value<=30?value:7}
export const stripePlanMetadata=(businessId:string,plan:MembershipPlan)=>({business_id:businessId,membership_plan:plan,catalog:'membership-entitlements:v1'})

export function subscriptionPlan(subscription:Stripe.Subscription):MembershipPlan|null{const item=subscription.items.data[0]
  return planFromPriceId(item?.price?.id)??(subscription.metadata.membership_plan==='expenses'||subscription.metadata.membership_plan==='business'?subscription.metadata.membership_plan:null)}
export function subscriptionPeriodEnd(subscription:Stripe.Subscription){const values=subscription.items.data.map(item=>item.current_period_end).filter(Number.isFinite)
  return values.length?new Date(Math.max(...values)*1000).toISOString():null}
export function providerCustomerId(value:string|Stripe.Customer|Stripe.DeletedCustomer){return typeof value==='string'?value:value.id}
export function displayPlan(plan:MembershipPlan){return membershipPlans[plan]}
