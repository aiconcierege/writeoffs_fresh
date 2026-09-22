import {vehicleQuestionProjectionCurrent} from '../mileage/annual-use-question'
import 'server-only'
import type {SupabaseClient} from '@supabase/supabase-js'
import {timed} from '../performance/request-timing'
import type {IndexedWorkProjection} from './action-index-model'
import type {GuidedWorkProjection} from './guided-work-projection'

export async function readBettiActionIndex<V extends 'full'|'guided'>(input:{db:SupabaseClient;businessId:string;continuityRecordId?:string;view:V;processingEnabled?:boolean}):Promise<(V extends 'full'?IndexedWorkProjection:GuidedWorkProjection)|null>{
 const result=await timed('canonical_action_index',async()=>await input.db.rpc('read_betti_action_index',{
  p_business_id:input.businessId,p_continuity_record_id:input.continuityRecordId??null,p_view:input.view,
  p_processing_enabled:input.processingEnabled??true,
 }))
 if(result.error)throw new Error('ACTION_INDEX_UNAVAILABLE')
 if(!result.data)return null // Bootstrap fallback reads canonical facts; it does not populate the index.
 if(result.data.businessId!==input.businessId||result.data.index?.version!==1)throw new Error('ACTION_INDEX_INVALID')
 if(!vehicleQuestionProjectionCurrent(result.data))return null
 return result.data
}
