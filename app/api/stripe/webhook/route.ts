import {headers} from 'next/headers'
import {NextResponse} from 'next/server'
import {createServerAdminSupabase} from '../../../../utils/supabase/admin'
import {applyStripeEvent} from '../../../lib/membership/stripe-events'
import {createStripeClient,stripeConfiguration} from '../../../lib/membership/stripe'

export const runtime='nodejs'
export async function POST(request:Request){let stripe,secret:string
  try{stripe=createStripeClient();secret=stripeConfiguration().webhookSecret;if(!secret)throw new Error('WEBHOOK_NOT_CONFIGURED')}catch{return NextResponse.json({error:'Webhook unavailable.'},{status:503})}
  const signature=(await headers()).get('stripe-signature');if(!signature)return NextResponse.json({error:'Invalid webhook signature.'},{status:400})
  let event;try{event=stripe.webhooks.constructEvent(await request.text(),signature,secret)}catch{return NextResponse.json({error:'Invalid webhook signature.'},{status:400})}
  try{const result=await applyStripeEvent({event,stripe,admin:createServerAdminSupabase()});return NextResponse.json({received:true,result})}
  catch{return NextResponse.json({error:'Webhook processing must be retried.'},{status:503})}}
