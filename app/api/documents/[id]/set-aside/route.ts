import {NextResponse} from 'next/server'
import {createServerSupabase} from '../../../../../utils/supabase/server'
import {requireCapability,membershipErrorResponse} from '../../../../lib/membership/entitlements'
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 const db=await createServerSupabase(),{data:{user}}=await db.auth.getUser()
 if(!user)return NextResponse.json({error:'Sign in to continue.'},{status:401})
 try{await requireCapability(db,'upload_statements')}catch(e){const r=membershipErrorResponse(e);return NextResponse.json({error:r.error},{status:r.status})}
 const{id}=await context.params
 const body=await request.json().catch(()=>null),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
 if(!uuid.test(id)||!uuid.test(body?.requestId??''))return NextResponse.json({error:'Choose the document again.'},{status:400})
 const result=await db.rpc('set_aside_unrecognized_document',{p_document:id,p_request:body.requestId})
 if(result.error||result.data!==true)return NextResponse.json({error:'This document cannot be set aside. Refresh to see its current status.'},{status:409})
 return NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}})
}
