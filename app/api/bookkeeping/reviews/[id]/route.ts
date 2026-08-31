import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../utils/supabase/server'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const supabase=await createServerSupabase();const{data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
  const{id}=await context.params,body=await request.json().catch(()=>null)
  if(!body||!['confirmed','deferred'].includes(body.action)||!UUID.test(id)
    ||typeof body.expectedEventId!=='string'||!UUID.test(body.expectedEventId)
    ||typeof body.snapshotId!=='string'||!UUID.test(body.snapshotId)
    ||typeof body.requestId!=='string'||!UUID.test(body.requestId))return NextResponse.json({error:'Review action is invalid.'},{status:400})
  const current=await supabase.from('bookkeeping_review_period_events').select('event_type,review_snapshot_id')
    .eq('id',body.expectedEventId).eq('review_period_id',id).maybeSingle()
  if(current.error||!current.data||!['presented','correction_linked'].includes(current.data.event_type)
    ||current.data.review_snapshot_id!==body.snapshotId)
    return NextResponse.json({error:'This review changed. Refresh and take another look.'},{status:409})
  const deferred=body.action==='deferred'?new Date(Date.now()+7*86400000).toISOString():null
  const result=await supabase.rpc('append_customer_review_period_event',{p_review_period_id:id,
    p_expected_event_id:body.expectedEventId,p_event_type:body.action,p_review_snapshot_id:body.snapshotId??null,
    p_deferred_until:deferred,p_request_id:body.requestId})
  if(result.error)return NextResponse.json({error:'This review changed. Refresh and try again.'},{status:409})
  return NextResponse.json({id:result.data,state:body.action})
}
