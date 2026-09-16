import {after,NextResponse} from 'next/server'
import {createServerSupabase} from '../../../utils/supabase/server'
import {requireCapability,membershipErrorResponse} from '../../lib/membership/entitlements'
import {drainCanonicalDocumentJobs} from '../../lib/documents/durable-processing'
export const runtime='nodejs'
export const maxDuration=180
export async function GET(){
 const db=await createServerSupabase(),{data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
 const r=await db.from('current_customer_document_status').select('*').order('created_at',{ascending:false}).limit(100)
 if(r.error)return NextResponse.json({error:'Documents could not be loaded.'},{status:503})
 return NextResponse.json({documents:r.data,processingPaused:process.env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED==='false'})
}
export async function POST(request:Request){
 const db=await createServerSupabase(),{data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
 try{await requireCapability(db,'upload_statements')}catch(e){const r=membershipErrorResponse(e);return NextResponse.json({error:r.error},{status:r.status})}
 let b;try{b=await request.json()}catch{return NextResponse.json({error:'Please choose the file again.'},{status:400})}
 if(!b||!['bytes,fingerprint,id,mime,name','bytes,fingerprint,id,mime,name,recordId'].includes(Object.keys(b).sort().join(','))||b.recordId&&!/^[0-9a-f-]{36}$/i.test(b.recordId)||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(b.id??'')||!/^[a-f0-9]{64}$/.test(b.fingerprint??'')||typeof b.name!=='string'||b.name.length>255||!Number.isSafeInteger(b.bytes)||b.bytes<1||b.bytes>20*1024*1024||!['application/pdf','image/png','image/jpeg','image/webp','text/csv','application/octet-stream'].includes(b.mime))return NextResponse.json({error:'This file could not be accepted.'},{status:400})
 const object=await db.storage.from('receipts').info(`receipts/${user.id}/${b.fingerprint}`)
 if(object.error||Number(object.data?.size??object.data?.metadata?.size)!==b.bytes)return NextResponse.json({error:'The uploaded file could not be verified. Please choose it again.'},{status:400})
 const result=await db.rpc(b.recordId?'register_transaction_document':'register_customer_document',{...(b.recordId?{p_record:b.recordId}:{}),p_id:b.id,p_fingerprint:b.fingerprint,p_name:b.name,p_mime:b.mime,p_bytes:b.bytes})
 if(result.error)return NextResponse.json({error:'Your document could not be registered. If several files are processing, please try again shortly.'},{status:400})
 const document=result.data,paused=process.env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED==='false'
 if(!paused)after(async()=>{try{await drainCanonicalDocumentJobs({documentId:document.id})}catch{/* durable cron retries */}})
 return NextResponse.json({document:{id:document.id},processingPaused:paused})
}
