import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../utils/supabase/server'

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const supabase=await createServerSupabase();const{data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
  const{id}=await context.params,body=await request.json().catch(()=>null)
  if(!body||!['confirmed','deferred'].includes(body.action)||typeof body.expectedEventId!=='string'
    ||typeof body.requestId!=='string')return NextResponse.json({error:'Review action is invalid.'},{status:400})
  const deferred=body.action==='deferred'?new Date(Date.now()+7*86400000).toISOString():null
  const result=await supabase.rpc('append_customer_review_period_event',{p_review_period_id:id,
    p_expected_event_id:body.expectedEventId,p_event_type:body.action,p_review_snapshot_id:body.snapshotId??null,
    p_deferred_until:deferred,p_request_id:body.requestId})
  if(result.error)return NextResponse.json({error:'This review changed. Refresh and try again.'},{status:409})
  return NextResponse.json({id:result.data})
}
