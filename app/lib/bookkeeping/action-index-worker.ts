import {frozenStagingBusinesses} from './action-index-freeze'
import 'server-only'
import {randomUUID} from 'node:crypto'
import type {SupabaseClient} from '@supabase/supabase-js'
import {createServerAdminSupabase} from '../../../utils/supabase/admin'
import {entitlementsFromMembership} from '../membership/entitlements'
import {getCanonicalQuestionCandidates} from './customer-questions'
import {listCanonicalReviewQueue} from './review-queue'
import {workSnapshotReader,type WorkInputSnapshot} from './work-input-snapshot'
import {ACTION_INDEX_VERSION,buildActionIndex} from './action-index-model'

export function actionIndexEnabled(){return process.env.WRITEOFFS_ENVIRONMENT==='staging'&&process.env.BETTI_ACTION_INDEX_ENABLED!=='false'}

/** Explicit mutation/worker path only. The durable state survives a lost after()
 * callback. One lease per business coalesces retries and concurrent notifications. */
export async function refreshBettiActionIndex(input:{admin?:SupabaseClient;businessId?:string;limit?:number}={}){
 const excluded=frozenStagingBusinesses()
 if(input.businessId&&excluded.includes(input.businessId))return {published:0,conflicted:0,failed:0}
 const admin=input.admin??createServerAdminSupabase(),processingEnabled=process.env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED!=='false'
 let published=0,conflicted=0,failed=0
 for(let i=0;i<Math.min(12,Math.max(1,input.limit??1));i++){
  const leaseId=randomUUID()
  const claim=await admin.rpc('claim_betti_action_index_refresh_excluding',{p_lease_id:leaseId,p_business_id:input.businessId??null,
   p_engine_version:ACTION_INDEX_VERSION,p_processing_enabled:processingEnabled,p_excluded_business_ids:excluded})
  if(claim.error)throw new Error('ACTION_INDEX_CLAIM_FAILED')
  const state=claim.data?.[0];if(!state)break
  const businessId=String(state.business_id)
  try{
   const prepared=await admin.rpc('prepare_betti_action_index_refresh',{p_business_id:businessId,p_lease_id:leaseId})
   if(prepared.error)throw new Error('ACTION_INDEX_PREPARATION_FAILED')
   const asOf=new Date().toISOString()
   const read=await admin.rpc('read_betti_action_index_build',{p_business_id:businessId,p_lease_id:leaseId,p_as_of:asOf})
   if(read.error||!read.data)throw new Error('ACTION_INDEX_INPUTS_FAILED')
   const snapshot=read.data.snapshot as WorkInputSnapshot,reader=workSnapshotReader(snapshot,businessId,asOf)
   const membership=entitlementsFromMembership(read.data.membership)
   const [queue,commandItems]=await Promise.all([
    getCanonicalQuestionCandidates({supabase:reader,businessId,scope:membership.plan??'expenses',asOf}),
    listCanonicalReviewQueue({supabase:reader,businessId,asOf}),
   ])
   const built=buildActionIndex({businessId,context:snapshot.context,questions:queue.questions,commandItems,asOf,processingEnabled})
   const result=await admin.rpc('publish_betti_action_index',{p_business_id:businessId,p_lease_id:leaseId,p_revision:read.data.revision,
    p_projection:{...built.work,_indexSummaryValidUntil:built.summaryValidUntil},p_entries:built.entries,p_valid_until:built.validUntil,p_plan:membership.plan??'expenses',
    p_engine_version:ACTION_INDEX_VERSION,p_processing_enabled:processingEnabled})
   if(result.error)throw new Error('ACTION_INDEX_PUBLICATION_FAILED')
   if(result.data===true)published++;else conflicted++
  }catch{
   failed++
   const retry=await admin.rpc('retry_betti_action_index_refresh',{p_business_id:businessId,p_lease_id:leaseId})
   if(retry.error)throw new Error('ACTION_INDEX_RETRY_FAILED')
  }
 }
 return{published,conflicted,failed}
}
