const DATE=/^\d{4}-\d{2}-\d{2}$/
export const CANONICAL_STAGING_SUPABASE_HOST='sgrqrrxrlglhjuetdtps.supabase.co'

export type StagingReviewOpenerSafetyInput={environment:string|undefined;url:string|undefined;
 expectedHost:string|undefined;email:string|undefined;allowlist:string|undefined;asOf:string|undefined;now?:Date}

export function validateStagingReviewOpener(input:StagingReviewOpenerSafetyInput){
 if(input.environment!=='staging')throw new Error('The weekly-review opener runs only in staging.')
 if(!input.url||!input.expectedHost)throw new Error('The staging Supabase identity is incomplete.')
 const parsed=new URL(input.url)
 if(parsed.protocol!=='https:'||parsed.hostname!==input.expectedHost
  ||parsed.hostname!==CANONICAL_STAGING_SUPABASE_HOST)throw new Error('The weekly-review opener target is not the approved staging project.')
 const email=input.email?.trim().toLowerCase(),allowed=new Set((input.allowlist??'').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean))
 if(!email||!allowed.has(email))throw new Error('The account is not an explicitly designated staging test user.')
 if(!input.asOf||!DATE.test(input.asOf)||Number.isNaN(Date.parse(`${input.asOf}T00:00:00Z`)))throw new Error('A valid --as-of date is required.')
 const today=new Date(input.now??new Date());today.setUTCHours(0,0,0,0)
 const requested=new Date(`${input.asOf}T00:00:00Z`),latest=new Date(today);latest.setUTCDate(latest.getUTCDate()+7)
 if(requested<today||requested>latest)throw new Error('The review date must be between today and seven days from today.')
 return{email,asOf:input.asOf,host:parsed.hostname}
}
