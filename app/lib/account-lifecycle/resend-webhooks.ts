import 'server-only'

import {createHash,createHmac,timingSafeEqual}from'node:crypto'
import type{SupabaseClient}from'@supabase/supabase-js'

export const resendLifecycleEventTypes=['email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed']as const
type ResendLifecycleEventType=typeof resendLifecycleEventTypes[number]
type VerifiedEvent={type:ResendLifecycleEventType;createdAt:string;emailId:string}

const hash=(value:string)=>createHash('sha256').update(value).digest('hex')
function safeEqual(a:string,b:string){const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right)}

export function verifyResendWebhook(input:{payload:string;id:string|null;timestamp:string|null;signature:string|null;secret:string|undefined;now?:number}):VerifiedEvent{
 const{id,timestamp,signature}=input,secret=input.secret?.trim();if(!id||!timestamp||!signature||!secret?.startsWith('whsec_'))throw new Error('INVALID_RESEND_WEBHOOK')
 const seconds=Number(timestamp),now=input.now??Date.now();if(!Number.isInteger(seconds)||Math.abs(now-seconds*1000)>5*60*1000)throw new Error('INVALID_RESEND_WEBHOOK')
 let key:Buffer;try{key=Buffer.from(secret.slice(6),'base64')}catch{throw new Error('INVALID_RESEND_WEBHOOK')};if(key.length<16)throw new Error('INVALID_RESEND_WEBHOOK')
 const expected=createHmac('sha256',key).update(`${id}.${timestamp}.${input.payload}`).digest('base64'),valid=signature.split(' ').some(part=>{const[value,provided]=part.split(',',2);return value==='v1'&&!!provided&&safeEqual(expected,provided)})
 if(!valid)throw new Error('INVALID_RESEND_WEBHOOK')
 let body:unknown;try{body=JSON.parse(input.payload)}catch{throw new Error('INVALID_RESEND_WEBHOOK')}
 if(!body||typeof body!=='object')throw new Error('INVALID_RESEND_WEBHOOK');const event=body as{type?:unknown;created_at?:unknown;data?:{email_id?:unknown}}
 if(!resendLifecycleEventTypes.includes(event.type as ResendLifecycleEventType)||typeof event.created_at!=='string'||!Number.isFinite(Date.parse(event.created_at))||typeof event.data?.email_id!=='string'||event.data.email_id.length>200)throw new Error('INVALID_RESEND_WEBHOOK')
 return{type:event.type as ResendLifecycleEventType,createdAt:event.created_at,emailId:event.data.email_id}
}

export async function recordResendLifecycleEvent(admin:SupabaseClient,input:{eventId:string;event:VerifiedEvent}){const result=await admin.rpc('record_resend_lifecycle_webhook',{p_event_key_hash:hash(input.eventId),p_event_type:input.event.type,p_provider_message_id:input.event.emailId,p_provider_message_fingerprint:hash(input.event.emailId),p_occurred_at:input.event.createdAt});if(result.error)throw new Error('RESEND_WEBHOOK_RECORD_FAILED');return{recorded:result.data===true}}
