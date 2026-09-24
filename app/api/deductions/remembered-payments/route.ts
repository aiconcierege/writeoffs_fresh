import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { requireCapability, membershipErrorResponse } from '../../../lib/membership/entitlements'
export async function POST(request: Request) {
 const db=await createServerSupabase(),{data:{user}}=await db.auth.getUser()
 if(!user)return NextResponse.json({error:'Sign in to continue.'},{status:401})
 try{await requireCapability(db,'autonomous_processing')}catch(error){const r=membershipErrorResponse(error);return NextResponse.json({error:r.error},{status:r.status})}
 let body;try{body=await request.json()}catch{return NextResponse.json({error:'Check your response.'},{status:400})}
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
 if(!uuid.test(body?.factId??'')||!uuid.test(body?.requestId??''))return NextResponse.json({error:'Check your response.'},{status:400})
 const result=await db.rpc('stop_remembered_payment',{p_fact:body.factId,p_request:body.requestId})
 if(result.error)return NextResponse.json({error:'These details changed. Refresh before trying again.'},{status:409})
 return NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}})
}
