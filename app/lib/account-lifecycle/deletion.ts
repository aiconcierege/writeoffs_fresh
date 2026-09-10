import 'server-only'

import {createHmac,randomUUID} from 'node:crypto'
import type {SupabaseClient} from '@supabase/supabase-js'
import {createServerAdminSupabase} from '../../../utils/supabase/admin'
import {createStripeClient} from '../membership/stripe'
import {createPlaidGateway} from '../plaid/client'
import {decryptPlaidAccessToken} from '../plaid/token-crypto'

type Row=Record<string,unknown>
const safeCode=(error:unknown)=>error instanceof Error&&/^[A-Z0-9_]{1,100}$/.test(error.message)?error.message:'ACCOUNT_DELETION_FAILED'
function deletionKey(){const value=process.env.ACCOUNT_DELETION_HMAC_KEY;if(!value||value.length<32)throw new Error('ACCOUNT_DELETION_KEY_UNAVAILABLE');return value}
function identityHash(kind:'business'|'user',id:string){return createHmac('sha256',deletionKey()).update(`writeoffs-deletion:v1:${kind}:${id}`).digest('hex')}

export async function requireAal2Owner(supabase:SupabaseClient){
  const [{data:{user}},assurance]=await Promise.all([supabase.auth.getUser(),supabase.auth.mfa.getAuthenticatorAssuranceLevel()])
  if(!user)throw new Error('AUTHENTICATION_REQUIRED')
  if(assurance.data?.currentLevel!=='aal2')throw new Error('AAL2_REQUIRED')
  const business=await supabase.from('businesses').select('id').eq('owner_user_id',user.id).single()
  if(!business.data)throw new Error('BUSINESS_NOT_FOUND')
  return{userId:user.id,businessId:String(business.data.id)}
}

async function stopRenewal(admin:SupabaseClient,businessId:string,requestKey:string){
  const link=await admin.from('membership_provider_links').select('provider_subscription_id').eq('business_id',businessId).maybeSingle()
  if(!link.data?.provider_subscription_id)return
  const stripe=createStripeClient()
  const subscription=await stripe.subscriptions.retrieve(String(link.data.provider_subscription_id))
  if(!subscription.cancel_at_period_end&&subscription.status!=='canceled')await stripe.subscriptions.update(subscription.id,{cancel_at_period_end:true},{idempotencyKey:`account-deletion-${businessId}-${requestKey}`})
}

async function revokePlaidItems(admin:SupabaseClient,businessId:string){
  const items=await admin.from('plaid_items').select('id,access_token_ciphertext,connection_status,consent_status').eq('business_id',businessId)
  if(items.error)throw new Error('PLAID_STATE_UNAVAILABLE')
  const gateway=createPlaidGateway()
  for(const item of items.data??[]){
    if(item.connection_status==='disconnected')continue
    if(item.consent_status!=='revoked')await gateway.removeItem(decryptPlaidAccessToken(String(item.access_token_ciphertext)))
    const result=await admin.rpc('disconnect_plaid_item_state',{p_item_record_id:item.id,p_business_id:businessId})
    if(result.error||result.data!==true)throw new Error('PLAID_DISCONNECT_FAILED')
  }
}

export async function scheduleAccountDeletion(input:{supabase:SupabaseClient;requestKey:string}){
  const owner=await requireAal2Owner(input.supabase),admin=createServerAdminSupabase()
  const result=await input.supabase.rpc('schedule_customer_account_deletion',{p_business_id:owner.businessId,p_user_id:owner.userId,
    p_business_identity_hash:identityHash('business',owner.businessId),p_user_identity_hash:identityHash('user',owner.userId),p_request_key:input.requestKey})
  if(result.error)throw new Error('DELETION_SCHEDULE_FAILED')
  await Promise.all([stopRenewal(admin,owner.businessId,input.requestKey),revokePlaidItems(admin,owner.businessId)])
  const row=await admin.from('account_deletion_requests').select('id,scheduled_for,status').eq('id',result.data).single()
  if(row.error)throw new Error('DELETION_STATE_UNAVAILABLE')
  return row.data
}

export async function cancelAccountDeletion(input:{supabase:SupabaseClient;requestId:string;requestKey:string}){
  const owner=await requireAal2Owner(input.supabase)
  const result=await input.supabase.rpc('cancel_customer_account_deletion',{p_request_id:input.requestId,p_user_id:owner.userId,p_request_key:input.requestKey})
  if(result.error||result.data!==true)throw new Error('DELETION_CANCEL_FAILED')
  return{canceled:true,reconnectPlaid:true}
}

async function deletePrivateObjects(admin:SupabaseClient,userId:string){
  async function walk(prefix:string){let offset=0;const files=[]as string[];for(;;){const listed=await admin.storage.from('receipts').list(prefix,{limit:100,offset});if(listed.error)throw new Error('STORAGE_LIST_FAILED')
    for(const value of listed.data??[]){if(!value.name||value.name==='.emptyFolderPlaceholder')continue;const path=`${prefix}/${value.name}`;if(value.id)files.push(path);else await walk(path)}
    if((listed.data??[]).length<100)break;offset+=100}for(let index=0;index<files.length;index+=100){const removed=await admin.storage.from('receipts').remove(files.slice(index,index+100));if(removed.error)throw new Error('STORAGE_DELETE_FAILED')}}
  for(const prefix of[`receipts/${userId}`,`statements/${userId}`])await walk(prefix)
}

async function disconnectInactivePlaid(admin:SupabaseClient){const rows=await admin.from('plaid_items').select('business_id').neq('connection_status','disconnected');if(rows.error)throw new Error('PLAID_STATE_UNAVAILABLE')
  const ids=[...new Set((rows.data??[]).map(row=>String(row.business_id)))],failures:string[]=[];for(const businessId of ids){const membership=await admin.from('business_memberships').select('lifecycle,access_through,grace_through').eq('business_id',businessId).maybeSingle(),now=Date.now(),access=membership.data?.access_through?new Date(membership.data.access_through).getTime():Infinity,grace=membership.data?.grace_through?new Date(membership.data.grace_through).getTime():0,active=membership.data&&((['active','canceling'].includes(membership.data.lifecycle)&&access>now)||(membership.data.lifecycle==='payment_issue'&&grace>now));if(!active)try{await revokePlaidItems(admin,businessId)}catch(error){failures.push(safeCode(error))}}
  if(failures.length)console.warn('Inactive Plaid disconnects need retry.',{count:failures.length,codes:[...new Set(failures)]})
  return failures
}

export async function drainAccountDeletionQueue(limit=5){
  const admin=createServerAdminSupabase(),leaseToken=randomUUID(),now=new Date().toISOString()
  await admin.rpc('advance_customer_retention_lifecycle',{p_now:now})
  await disconnectInactivePlaid(admin)
  const claimed=await admin.rpc('claim_due_account_deletions',{p_limit:limit,p_lease_token:leaseToken,p_now:now})
  if(claimed.error)throw new Error('DELETION_CLAIM_FAILED')
  const results:Array<{id:string;status:string;code?:string}>=[]
  for(const request of(claimed.data??[])as Row[]){const id=String(request.id),businessId=request.business_id?String(request.business_id):null,userId=request.owner_user_id?String(request.owner_user_id):null
    try{
      if(businessId)await revokePlaidItems(admin,businessId)
      if(userId)await deletePrivateObjects(admin,userId)
      if(businessId){const deleted=await admin.rpc('delete_customer_application_data',{p_request_id:id,p_lease_token:leaseToken,p_now:new Date().toISOString()});if(deleted.error)throw new Error('APPLICATION_DATA_DELETE_FAILED')}
      if(userId){const auth=await admin.auth.admin.deleteUser(userId);if(auth.error)throw new Error('AUTH_DELETE_FAILED')}
      const completed=await admin.rpc('complete_account_deletion',{p_request_id:id,p_lease_token:leaseToken,p_now:new Date().toISOString()})
      if(completed.error||completed.data!==true)throw new Error('DELETION_COMPLETION_FAILED')
      results.push({id,status:'completed'})
    }catch(error){const code=safeCode(error);await admin.rpc('record_account_deletion_failure',{p_request_id:id,p_lease_token:leaseToken,p_safe_code:code,p_now:new Date().toISOString()});results.push({id,status:'retryable',code})}
  }
  return results
}
