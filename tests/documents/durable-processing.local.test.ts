import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument,StandardFonts } from 'pdf-lib'
import { loadEnvConfig } from '@next/env'
import {createCanvas} from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { drainCanonicalDocumentJobs } from '../../app/lib/documents/durable-processing'
import { listTransactionReadModel } from '../../app/lib/bookkeeping/transaction-read-model'
import { SupabaseCanonicalFinancialSummaryRepository } from '../../app/lib/bookkeeping/financial-summary-repository'
import {ingestCsvFinancialActivity,prepareCsvFinancialRows} from '../../app/lib/bookkeeping/csv-ingestion'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

loadEnvConfig(process.cwd(),true)
const url=process.env.LOCAL_SUPABASE_URL??process.env.SUPABASE_URL,
  anonKey=process.env.LOCAL_SUPABASE_ANON_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  serviceKey=process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY
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

  it('ingests a native-text statement into ordinary canonical financial activity',async()=>{
    const admin=createClient(url!,serviceKey!,{auth:{persistSession:false}})
    const owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'durable-statement-ingest',amounts:[]})
    const pdf=await PDFDocument.create(),page=pdf.addPage([612,792]),font=await pdf.embedFont(StandardFonts.Helvetica)
    ;['Example Bank','Account ending in 1234','Statement Period: 01/01/2026 - 01/31/2026','Beginning balance $1,000.00',
      '01/05/2026 PAYROLL DEPOSIT +100.00','01/07/2026 CHECK #104 MATERIALS 50.00','Ending balance $1,050.00']
      .forEach((line,index)=>page.drawText(line,{x:50,y:740-index*24,size:12,font}))
    const bytes=await pdf.save(),fingerprint=createHash('sha256').update(bytes).digest('hex'),path=`statements/${owner.userId}/${fingerprint}`
    expect((await admin.storage.from('receipts').upload(path,bytes,{contentType:'application/pdf'})).error).toBeNull()
    const id=randomUUID();expect((await owner.customer.rpc('register_business_statement',{p_document_id:id,p_document_class:'bank_statement',
      p_upload_fingerprint:fingerprint,p_storage_path:path,p_original_name:'checking.pdf',p_mime_type:'application/pdf',p_bytes:bytes.length})).error).toBeNull()
    for(let attempt=0;attempt<5;attempt+=1){await drainCanonicalDocumentJobs({admin,batchSize:10});const state=await admin.from('receipt_processing_jobs')
      .select('state').eq('document_id',id).single();if(state.data?.state==='completed')break}
    expect((await admin.from('receipt_processing_jobs').select('state').eq('document_id',id).single()).data?.state).toBe('completed')
    const periods=await owner.customer.from('current_customer_statement_periods').select('institution_name,masked_account,validation_status,transaction_count')
    expect(periods).toMatchObject({error:null,data:[{institution_name:'Example Bank',masked_account:'1234',validation_status:'validated',transaction_count:2}]})
    const transactions=await owner.customer.from('financial_transactions').select('amount_cents,import_method,original_description').eq('import_method','statement').order('amount_cents')
    expect(transactions).toMatchObject({error:null,data:[{amount_cents:-5000,import_method:'statement',original_description:'CHECK #104 MATERIALS'},
      {amount_cents:10000,import_method:'statement',original_description:'PAYROLL DEPOSIT'}]})
    const records=await owner.customer.from('bookkeeping_records').select('id').eq('source_kind','financial_transaction')
    expect(records.data).toHaveLength(2)
    expect(await listTransactionReadModel({supabase:owner.customer,userId:owner.userId})).toHaveLength(2)
    const report=await new SupabaseCanonicalFinancialSummaryRepository(owner.customer).loadRecords({businessId:owner.businessId,
      periodStart:'2026-01-01',periodEnd:'2026-12-31'})
    expect(report.records).toHaveLength(2)
    const decisions=await owner.customer.from('bookkeeping_decisions').select('treatment,provenance').in('bookkeeping_record_id',records.data!.map(row=>row.id))
    expect(decisions.data).toEqual([{treatment:'unresolved',provenance:'system'},{treatment:'unresolved',provenance:'system'}])
    await drainCanonicalDocumentJobs({admin,batchSize:10})
    expect((await owner.customer.from('financial_transactions').select('id').eq('import_method','statement')).data).toHaveLength(2)
    const prepared=prepareCsvFinancialRows({mapping:{date:'date',description:'description',amount:'amount'},rows:[
      {date:'2026-01-05',description:'PAYROLL DEPOSIT',amount:'100.00'},{date:'2026-01-07',description:'CHECK #104 MATERIALS',amount:'-50.00'}]})
    await ingestCsvFinancialActivity({supabase:owner.customer,rows:prepared.rows})
    expect(await listTransactionReadModel({supabase:owner.customer,userId:owner.userId})).toHaveLength(4)
    const accounts=await owner.customer.from('financial_accounts').select('id,provider')
    const statementAccount=accounts.data!.find(row=>row.provider==='statement')!,csvAccount=accounts.data!.find(row=>row.provider==='csv')!
    expect((await owner.customer.from('current_customer_statement_account_candidates').select('strong_identity')
      .eq('statement_account_id',statementAccount.id).eq('target_account_id',csvAccount.id).single()).data?.strong_identity).toBe(false)
    const other=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'statement-link-isolation',amounts:[]})
    await ingestCsvFinancialActivity({supabase:other.customer,rows:prepared.rows.slice(0,1)})
    const otherAccount=(await other.customer.from('financial_accounts').select('id').eq('provider','csv').single()).data!
    expect((await owner.customer.rpc('confirm_statement_account_link',{p_statement_account_id:statementAccount.id,
      p_target_account_id:otherAccount.id,p_request_key:randomUUID()})).error).not.toBeNull()
    const requestKey=randomUUID()
    const linked=await owner.customer.rpc('confirm_statement_account_link',{p_statement_account_id:statementAccount.id,
      p_target_account_id:csvAccount.id,p_request_key:requestKey});expect(linked.error).toBeNull()
    expect((await owner.customer.rpc('confirm_statement_account_link',{p_statement_account_id:statementAccount.id,
      p_target_account_id:csvAccount.id,p_request_key:requestKey})).data).toBe(linked.data)
    const convergences=await owner.customer.from('current_bookkeeping_source_convergences').select('*');expect(convergences.error).toBeNull()
    expect(convergences.data).toHaveLength(2)
    expect(await listTransactionReadModel({supabase:owner.customer,userId:owner.userId})).toHaveLength(2)
    const currentLink=await owner.customer.from('current_financial_account_equivalence_links').select('id,event_id').single()
    expect((await owner.customer.rpc('unlink_statement_account',{p_link_id:currentLink.data!.id,p_expected_event_id:currentLink.data!.event_id,
      p_reason:'The customer selected the wrong imported account.'})).error).toBeNull()
    expect(await listTransactionReadModel({supabase:owner.customer,userId:owner.userId})).toHaveLength(4)
  })

  it('OCRs an image-only statement once and reuses its page extraction',async()=>{
    const admin=createClient(url!,serviceKey!,{auth:{persistSession:false}}),owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'statement-ocr',amounts:[]})
    const canvas=createCanvas(900,1200),context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,900,1200)
    context.fillStyle='black';context.font='32px sans-serif';context.fillText('SCANNED BANK STATEMENT',80,120)
    const pdf=await PDFDocument.create(),image=await pdf.embedPng(canvas.toBuffer('image/png')),page=pdf.addPage([612,792]);page.drawImage(image,{x:0,y:0,width:612,height:792})
    const bytes=await pdf.save(),fingerprint=createHash('sha256').update(bytes).digest('hex'),path=`statements/${owner.userId}/${fingerprint}`
    expect((await admin.storage.from('receipts').upload(path,bytes,{contentType:'application/pdf'})).error).toBeNull();const id=randomUUID()
    expect((await owner.customer.rpc('register_business_statement',{p_document_id:id,p_document_class:'bank_statement',p_upload_fingerprint:fingerprint,
      p_storage_path:path,p_original_name:'scanned.pdf',p_mime_type:'application/pdf',p_bytes:bytes.length})).error).toBeNull()
    let calls=0;const ocr=async()=>{calls+=1;return 'Scanned Bank\nAccount ending in 9922\nStatement Period: 02/01/2026 - 02/28/2026\n02/03/2026 CLIENT DEPOSIT +75.00'}
    for(let attempt=0;attempt<5;attempt+=1){await drainCanonicalDocumentJobs({admin,batchSize:10,statementOcr:ocr});const state=await admin.from('receipt_processing_jobs').select('state').eq('document_id',id).single();if(state.data?.state==='completed')break}
    expect(calls).toBe(1);expect((await admin.from('statement_page_extractions').select('method,extraction_status').eq('document_id',id)).data)
      .toEqual([{method:'ocr',extraction_status:'usable'}]);expect((await owner.customer.from('financial_transactions').select('amount_cents').eq('import_method','statement')).data)
      .toEqual([{amount_cents:7500}]);await drainCanonicalDocumentJobs({admin,batchSize:10,statementOcr:ocr});expect(calls).toBe(1)
  })
})
