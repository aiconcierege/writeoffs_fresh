import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { validateGuidedReview } from '../../../lib/bookkeeping/guided-review'
export async function POST(request:Request) {
  const supabase=await createServerSupabase()
  const {data:{user}}=await supabase.auth.getUser()
  if(!user) return NextResponse.json({error:'Sign in to continue.'},{status:401})
  let body:ReturnType<typeof validateGuidedReview>
  try { body=validateGuidedReview(await request.json()) } catch { return NextResponse.json({error:'Check your selected purchases and try again.'},{status:400}) }
  const {data,error}=await supabase.rpc('apply_guided_review',{p_request_id:body.requestId,p_action:body.action,p_scope:body.scope,p_items:body.items})
  if(error) return NextResponse.json({error:'The selected purchases changed or are unavailable. Refresh this page before trying again.'},{status:409})
  return NextResponse.json({ok:true,results:data},{headers:{'Cache-Control':'private, no-store'}})
}
