import type {SupabaseClient} from '@supabase/supabase-js'
/** Use current event leaves: a resolved or superseded deferral is not pending work. */
export async function hasDeferredBookkeepingWork(supabase:SupabaseClient,businessId:string) {
 const now=new Date().toISOString()
 const result=await supabase.rpc('list_current_bookkeeping_review_issues',{p_business_id:businessId,p_as_of:'9999-01-01T00:00:00Z'})
 if(result.error)throw new Error('Deferred bookkeeping work is unavailable.')
 return (result.data??[]).some((row:{event_type:string;deferred_until:string|null})=>row.event_type==='skipped'&&row.deferred_until!=null&&row.deferred_until>now)
}
