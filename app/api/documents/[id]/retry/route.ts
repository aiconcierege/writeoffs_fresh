import { after, NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../utils/supabase/server'
import { createServerAdminSupabase } from '../../../../../utils/supabase/admin'
import { requireReceiptOwner } from '../../../../lib/bookkeeping/receipt-workflow'
import { requireCapability, membershipErrorResponse } from '../../../../lib/membership/entitlements'
import { drainCanonicalDocumentJobs } from '../../../../lib/documents/durable-processing'
export const runtime = 'nodejs'
export const maxDuration = 180
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase=await createServerSupabase()
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
  try{await requireCapability(supabase,'upload_statements')}catch(cause){const denied=membershipErrorResponse(cause);return NextResponse.json({error:denied.error},{status:denied.status})}
  const {id}=await context.params
  if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:'receipt_unavailable'},{status:404})
  try {
    const {businessId}=await requireReceiptOwner(supabase)
    const owned=await supabase.from('business_documents').select('id').eq('id',id).eq('business_id',businessId).eq('owner_user_id',user.id).maybeSingle()
    if(owned.error||!owned.data)return NextResponse.json({error:'receipt_unavailable'},{status:404})
    if(process.env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED==='false')return NextResponse.json({error:'processing_paused'},{status:503})
    const admin=createServerAdminSupabase()
    const job=await admin.from('receipt_processing_jobs').select('id,state').eq('document_id',id).eq('business_id',businessId).order('created_at',{ascending:false}).limit(1).maybeSingle()
    if(job.error||!job.data)throw new Error('JOB_UNAVAILABLE')
    if(['dead_letter','unreadable'].includes(job.data.state)) {
      const recovered=await admin.rpc('requeue_terminal_document_processing_job',{p_job_id:job.data.id,p_expected_state:job.data.state,p_reason:'CUSTOMER_REQUESTED_RETRY'})
      if(recovered.error)throw new Error('RECOVERY_FAILED')
    }
    after(async()=>{try{await drainCanonicalDocumentJobs({documentId:id,batchSize:1})}catch{/* durable cron recovery */}})
    return NextResponse.json({ok:true},{status:202})
  }catch{return NextResponse.json({error:'retry_unavailable'},{status:503})}
}
