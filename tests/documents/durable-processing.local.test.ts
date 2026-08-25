import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { drainCanonicalDocumentJobs } from '../../app/lib/documents/durable-processing'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url=process.env.LOCAL_SUPABASE_URL,anonKey=process.env.LOCAL_SUPABASE_ANON_KEY,serviceKey=process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled=process.env.RUN_LOCAL_SUPABASE_INTEGRATION==='1'&&Boolean(url&&anonKey&&serviceKey)
const suite=enabled?describe.sequential:describe.skip

suite('durable document processing against local PostgreSQL',()=>{
  it('enqueues canonical and shadow identities independently and deduplicates exact receipt bytes',async()=>{
    const admin=createClient(url!,serviceKey!,{auth:{persistSession:false}})
    const owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'durable-receipt',amounts:[]})
    const bytes=new Uint8Array([0x89,0x50,0x4e,0x47,1,2,3,4]),fingerprint=createHash('sha256').update(bytes).digest('hex')
    const path=`receipts/${owner.userId}/${fingerprint}`
    expect((await admin.storage.from('receipts').upload(path,bytes,{contentType:'image/png'})).error).toBeNull()
    const firstId=randomUUID();const args={p_receipt_id:firstId,p_upload_fingerprint:fingerprint,p_storage_path:path,
      p_original_name:'batch.png',p_mime_type:'image/png',p_bytes:bytes.length}
    const first=await owner.customer.rpc('register_bookkeeping_receipt',args);expect(first.error).toBeNull()
    const duplicate=await owner.customer.rpc('register_bookkeeping_receipt',{...args,p_receipt_id:randomUUID()});expect(duplicate.error).toBeNull()
    const duplicateRow=Array.isArray(duplicate.data)?duplicate.data[0]:duplicate.data;expect(duplicateRow.id).toBe(firstId)
    const{data:jobs}=await admin.from('receipt_processing_jobs').select('job_type,state').eq('receipt_id',firstId)
    expect(jobs?.map(job=>job.job_type).sort()).toEqual(['canonical_receipt_extraction','receipt_understanding_shadow'])
    await admin.from('receipt_processing_jobs').update({available_at:new Date(0).toISOString()})
      .eq('receipt_id',firstId).eq('job_type','canonical_receipt_extraction')
    const lease=randomUUID();const claim=await admin.rpc('claim_receipt_processing_jobs_by_type',{p_lease_id:lease,
      p_job_types:['canonical_receipt_extraction'],p_limit:10,p_lease_seconds:60})
    expect(claim.error).toBeNull();const claimed=claim.data.find((job:{receipt_id:string})=>job.receipt_id===firstId)
    expect(claimed).toMatchObject({job_type:'canonical_receipt_extraction'})
    const finish=await admin.rpc('finish_receipt_processing_job',{p_job_id:claimed.id,p_lease_id:lease,
      p_state:'needs_attention',p_terminal_reason:'DETAILS_UNAVAILABLE'});expect(finish).toMatchObject({data:true,error:null})
    const visible=await owner.customer.from('current_customer_receipt_processing_status').select('processing_status').eq('receipt_id',firstId).single()
    expect(visible).toMatchObject({data:{processing_status:'needs_attention'},error:null})
    const staleRecovery=await admin.rpc('requeue_terminal_document_processing_job',{p_job_id:claimed.id,
      p_expected_state:'unreadable',p_reason:'OPERATOR_RETRY'})
    expect(staleRecovery).toMatchObject({data:false,error:null})
    const recovery=await admin.rpc('requeue_terminal_document_processing_job',{p_job_id:claimed.id,
      p_expected_state:'needs_attention',p_reason:'OPERATOR_RETRY'})
    expect(recovery).toMatchObject({data:true,error:null})
    const recovered=await admin.from('receipt_processing_jobs').select('state,attempt_count,recovery_count,last_error_code')
      .eq('id',claimed.id).single()
    expect(recovered).toMatchObject({data:{state:'retryable',attempt_count:0,recovery_count:1,
      last_error_code:'OPERATOR_RETRY'},error:null})
  })

  it('keeps statement intake Business-scoped, idempotent, and separate from receipts',async()=>{
    const admin=createClient(url!,serviceKey!,{auth:{persistSession:false}})
    const owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'durable-statement',amounts:[]})
    const bytes=new TextEncoder().encode('%PDF-1.7 synthetic'),fingerprint=createHash('sha256').update(bytes).digest('hex')
    const path=`statements/${owner.userId}/${fingerprint}`;expect((await admin.storage.from('receipts').upload(path,bytes,{contentType:'application/pdf'})).error).toBeNull()
    const id=randomUUID();const args={p_document_id:id,p_document_class:'bank_statement',p_upload_fingerprint:fingerprint,
      p_storage_path:path,p_original_name:'twelve-months.pdf',p_mime_type:'application/pdf',p_bytes:bytes.length}
    expect((await owner.customer.rpc('register_business_statement',args)).error).toBeNull()
    const duplicate=await owner.customer.rpc('register_business_statement',{...args,p_document_id:randomUUID()});expect(duplicate.error).toBeNull()
    const row=Array.isArray(duplicate.data)?duplicate.data[0]:duplicate.data;expect(row.id).toBe(id)
    const{data:job}=await admin.from('receipt_processing_jobs').select('receipt_id,document_id,job_type').eq('document_id',id).single()
    expect(job).toEqual({receipt_id:null,document_id:id,job_type:'statement_inspection'})
    const other=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'other-statement',amounts:[]})
    const cross=await other.customer.from('business_documents').select('*').eq('id',id);expect(cross.data).toEqual([])
  })

  it('finishes a canonical PDF receipt durably without a browser continuation',async()=>{
    const admin=createClient(url!,serviceKey!,{auth:{persistSession:false}})
    const owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'durable-pdf',amounts:[]})
    const pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save()
    const fingerprint=createHash('sha256').update(bytes).digest('hex'),path=`receipts/${owner.userId}/${fingerprint}`
    expect((await admin.storage.from('receipts').upload(path,bytes,{contentType:'application/pdf'})).error).toBeNull()
    const id=randomUUID();expect((await owner.customer.rpc('register_bookkeeping_receipt',{p_receipt_id:id,
      p_upload_fingerprint:fingerprint,p_storage_path:path,p_original_name:'receipt.pdf',p_mime_type:'application/pdf',p_bytes:bytes.length})).error).toBeNull()
    await drainCanonicalDocumentJobs({admin,batchSize:10})
    const{data:job}=await admin.from('receipt_processing_jobs').select('state,terminal_reason,last_error_code').eq('receipt_id',id)
      .eq('job_type','canonical_receipt_extraction').single()
    expect(job).toEqual({state:'needs_attention',terminal_reason:'PDF_TEXT_UNAVAILABLE',last_error_code:null})
    const{data:event}=await owner.customer.from('bookkeeping_receipt_events').select('event_type,provenance,actor_user_id')
      .eq('receipt_id',id).order('sequence_number',{ascending:false}).limit(1).single()
    expect(event).toEqual({event_type:'extraction_completed',provenance:'automation',actor_user_id:null})
  })
})
