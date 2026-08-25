import {NextResponse} from 'next/server'
import {createServerSupabase} from '../../../../../utils/supabase/server'
import{membershipErrorResponse,requireCapability}from'../../../../lib/membership/entitlements'

export async function GET(){const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
  const [candidates,links]=await Promise.all([supabase.from('current_customer_statement_account_candidates')
    .select('statement_account_id,target_account_id,display_name,provider,strong_identity'),supabase.from('current_financial_account_equivalence_links')
    .select('id,event_id,statement_account_id,target_account_id')])
  if(candidates.error||links.error)return NextResponse.json({error:'Account choices could not be loaded.'},{status:503})
  return NextResponse.json({ok:true,candidates:candidates.data??[],links:links.data??[]})}

export async function POST(request:Request){const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'unauthorized'},{status:401});try{await requireCapability(supabase,'upload_statements')}catch(cause){const denied=membershipErrorResponse(cause);return NextResponse.json({error:denied.error},{status:denied.status})}const body=await request.json().catch(()=>null) as Record<string,unknown>|null
  if(!body||typeof body.statementAccountId!=='string'||typeof body.targetAccountId!=='string')return NextResponse.json({error:'Choose an account to link.'},{status:400})
  const result=await supabase.rpc('confirm_statement_account_link',{p_statement_account_id:body.statementAccountId,
    p_target_account_id:body.targetAccountId,p_request_key:typeof body.requestKey==='string'?body.requestKey:crypto.randomUUID()})
  if(result.error)return NextResponse.json({error:'We could not link those accounts safely.'},{status:409})
  return NextResponse.json({ok:true,linkId:result.data})}

export async function DELETE(request:Request){const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'unauthorized'},{status:401});try{await requireCapability(supabase,'upload_statements')}catch(cause){const denied=membershipErrorResponse(cause);return NextResponse.json({error:denied.error},{status:denied.status})}const body=await request.json().catch(()=>null) as Record<string,unknown>|null
  if(!body||typeof body.linkId!=='string'||typeof body.expectedEventId!=='string')return NextResponse.json({error:'The account link changed. Reload and try again.'},{status:400})
  const result=await supabase.rpc('unlink_statement_account',{p_link_id:body.linkId,p_expected_event_id:body.expectedEventId,
    p_reason:'Customer corrected the statement account link.'})
  if(result.error)return NextResponse.json({error:'We could not remove this link safely.'},{status:409})
  return NextResponse.json({ok:true})}
