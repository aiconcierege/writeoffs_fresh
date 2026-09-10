import {NextResponse}from'next/server'
import {createServerAdminSupabase}from'../../../../utils/supabase/admin'
import{recordResendLifecycleEvent,verifyResendWebhook}from'../../../lib/account-lifecycle/resend-webhooks'

export const runtime='nodejs'
export async function POST(request:Request){const secret=process.env.RESEND_WEBHOOK_SECRET;if(!secret)return NextResponse.json({error:'Webhook unavailable.'},{status:503});const payload=await request.text(),id=request.headers.get('svix-id');let event
 try{event=verifyResendWebhook({payload,id,timestamp:request.headers.get('svix-timestamp'),signature:request.headers.get('svix-signature'),secret})}catch{return NextResponse.json({error:'Invalid webhook signature.'},{status:400})}
 try{const result=await recordResendLifecycleEvent(createServerAdminSupabase(),{eventId:id!,event});return NextResponse.json({received:true,duplicate:!result.recorded})}catch{return NextResponse.json({error:'Webhook processing must be retried.'},{status:503})}}
