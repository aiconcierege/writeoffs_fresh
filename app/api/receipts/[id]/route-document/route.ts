import {randomUUID} from 'node:crypto'
import {after,NextResponse} from 'next/server'
import {createServerSupabase} from '../../../../../utils/supabase/server'
import {requireCapability,membershipErrorResponse} from '../../../../lib/membership/entitlements'
import {requireReceiptOwner} from '../../../../lib/bookkeeping/receipt-workflow'
import {drainCanonicalDocumentJobs} from '../../../../lib/documents/durable-processing'
export const runtime='nodejs'
export const maxDuration=180
export async function POST(_request:Request,context:{params:Promise<{id:string}>}){
 const db=await createServerSupabase(),{data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
 try{await requireCapability(db,'upload_statements')}catch(e){const r=membershipErrorResponse(e);return NextResponse.json({error:r.error},{status:r.status})}
 const{id}=await context.params,{businessId}=await requireReceiptOwner(db)
 const owned=await db.from('receipts').select('id,upload_fingerprint,original_name,mime_type,bytes').eq('id',id).eq('business_id',businessId).eq('user_id',user.id).maybeSingle()
 if(owned.error||!owned.data)return NextResponse.json({error:'Document unavailable.'},{status:404})
 const r=owned.data,result=await db.rpc('register_customer_document',{p_id:randomUUID(),p_fingerprint:r.upload_fingerprint,p_name:r.original_name??'Document',p_mime:r.mime_type,p_bytes:r.bytes})
 if(result.error)return NextResponse.json({error:'This document could not be sent for review.'},{status:400})
 if(process.env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED!=='false')after(async()=>{try{await drainCanonicalDocumentJobs({documentId:result.data.id})}catch{/* durable recovery */}})
 return NextResponse.json({documentId:result.data.id})
}
