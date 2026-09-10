import 'server-only'

type Message={to:string;subject:string;text:string;html:string;idempotencyKey:string;attemptNumber?:number}
export type DeliveryResult={id:string}
export class NotificationDeliveryError extends Error{constructor(public code:string,public permanent:boolean){super(code)}}
export async function sendLifecycleEmail(message:Message):Promise<DeliveryResult>{const mode=process.env.LIFECYCLE_EMAIL_MODE??'disabled'
 if(mode==='sink'){const allowed=new Set((process.env.LIFECYCLE_EMAIL_STAGING_RECIPIENTS??'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean)),environment=process.env.WRITEOFFS_ENVIRONMENT??process.env.APP_ENV;if(environment!=='staging'||!allowed.has(message.to.toLowerCase()))throw new NotificationDeliveryError('STAGING_RECIPIENT_NOT_ALLOWED',true);if(message.idempotencyKey.startsWith('cert-transient:')&&message.attemptNumber===1)throw new NotificationDeliveryError('NOTIFICATION_PROVIDER_NETWORK',false);return{id:`sink_${message.idempotencyKey}`}}
 if(mode!=='resend')throw new NotificationDeliveryError('NOTIFICATION_PROVIDER_UNCONFIGURED',true)
 const apiKey=process.env.RESEND_API_KEY?.trim(),from=process.env.LIFECYCLE_EMAIL_FROM?.trim();if(!apiKey?.startsWith('re_')||!from)throw new NotificationDeliveryError('NOTIFICATION_PROVIDER_UNCONFIGURED',true)
 let response:Response;try{response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json','idempotency-key':message.idempotencyKey},body:JSON.stringify({from,to:[message.to],subject:message.subject,text:message.text,html:message.html,reply_to:process.env.LIFECYCLE_EMAIL_REPLY_TO||undefined})})}catch{throw new NotificationDeliveryError('NOTIFICATION_PROVIDER_NETWORK',false)}
 if(response.ok){const body=await response.json().catch(()=>({}))as{id?:string};if(!body.id)throw new NotificationDeliveryError('NOTIFICATION_PROVIDER_INVALID_RESPONSE',false);return{id:body.id}}
 if(response.status===429||response.status>=500)throw new NotificationDeliveryError(response.status===429?'NOTIFICATION_PROVIDER_RATE_LIMIT':'NOTIFICATION_PROVIDER_UNAVAILABLE',false)
 if(response.status===400||response.status===422)throw new NotificationDeliveryError('NOTIFICATION_RECIPIENT_REJECTED',true)
 throw new NotificationDeliveryError('NOTIFICATION_PROVIDER_REJECTED',true)
}
