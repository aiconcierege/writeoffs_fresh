import 'server-only'
import {documentMayOverlap} from './overlap'
import {fileKind} from './file-validation'
import {readPdfPages} from './pdf-reader'
import {classifyDocumentText} from './classification'
import {parseStructuredFile} from './structured-text'
import { parseReceiptText, visionReceiptText } from './receipt-text'
export { parseReceiptText } from './receipt-text'

import { createHash, randomUUID } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerAdminSupabase } from '../../../utils/supabase/admin'
import { statementPageText, type PdfTextItem } from './pdf-layout'
import { parseStatementPages,periodToRpc } from './statement-intelligence'

type Row = Record<string, unknown>
export const CANONICAL_DOCUMENT_BATCH_MAX = 10
export const ORDINARY_VISION_PAGE_LIMIT = 10
export const STATEMENT_PAGE_LIMIT = 500
export const STATEMENT_CHUNK_PAGES = 25
export const STATEMENT_OCR_CHUNK_PAGES = 5
export const RECEIPT_FILE_BYTES_MAX = 20 * 1024 * 1024
export const STATEMENT_FILE_BYTES_MAX = 100 * 1024 * 1024
const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate'

const asRows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : value ? [value as Row] : []
const safeErrorCode = (error: unknown) => {
  if(error&&typeof error==='object'&&'code'in error&&['ERR_MODULE_NOT_FOUND','MODULE_NOT_FOUND'].includes(String(error.code)))return 'DOCUMENT_PDF_RUNTIME_UNAVAILABLE'
  const code = error instanceof Error ? error.message : ''
  return /^[A-Z0-9_]{1,100}$/.test(code) ? code : 'DOCUMENT_PROCESSING_FAILED'
}

function isPdf(bytes: Uint8Array) {
  return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
}

function supportedImage(bytes: Uint8Array, mimeType: string) {
  if (mimeType === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8
  if (mimeType === 'image/webp') return new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF'
    && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  return false
}

async function loadTarget(admin: SupabaseClient, job: Row) {
  const receiptId = typeof job.receipt_id === 'string' ? job.receipt_id : null
  const documentId = typeof job.document_id === 'string' ? job.document_id : null
  const id = receiptId ?? documentId
  if (!id) throw new Error('DOCUMENT_TARGET_UNAVAILABLE')
  const result = receiptId
    ? await admin.from('receipts').select('id,business_id,upload_fingerprint,storage_path,mime_type,original_name,bytes')
      .eq('id', id).eq('business_id', String(job.business_id)).single()
    : await admin.from('business_documents').select('id,business_id,upload_fingerprint,storage_path,mime_type,original_name,bytes,document_class')
      .eq('id', id).eq('business_id', String(job.business_id)).single()
  const data = result.data as Row | null
  if (result.error || !data || data.upload_fingerprint !== job.document_sha256) throw new Error('DOCUMENT_TARGET_STALE')
  const metadata=await admin.storage.from('receipts').info(String(data.storage_path))
  if(metadata.error)throw new Error('DOCUMENT_DOWNLOAD_FAILED')
  const storedSize=Number(metadata.data?.size??metadata.data?.metadata?.size)
  if(storedSize!==Number(data.bytes)||storedSize>(receiptId?RECEIPT_FILE_BYTES_MAX:STATEMENT_FILE_BYTES_MAX))throw new Error('DOCUMENT_SIZE_MISMATCH')
  const { data: blob, error: downloadError } = await admin.storage.from('receipts').download(String(data.storage_path))
  if (downloadError || !blob) throw new Error('DOCUMENT_DOWNLOAD_FAILED')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if(bytes.length!==Number(data.bytes)||bytes.length>(receiptId?RECEIPT_FILE_BYTES_MAX:STATEMENT_FILE_BYTES_MAX))throw new Error('DOCUMENT_SIZE_MISMATCH')
  if (createHash('sha256').update(bytes).digest('hex') !== job.document_sha256) throw new Error('DOCUMENT_HASH_MISMATCH')
  return { bytes,receiptId,documentId,storagePath:String(data.storage_path),mimeType:String(data.mime_type),
    originalName:typeof data.original_name==='string'?data.original_name:null,
    documentClass:typeof data.document_class==='string'?data.document_class:null }
}

export async function googleVision(bytes: Uint8Array, receiptLayout = false) {
  const apiKey = process.env.GCV_API_KEY
  if (!apiKey) throw new Error('DOCUMENT_PROVIDER_NOT_CONFIGURED')
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(`${VISION_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requests: [{ image: { content: Buffer.from(bytes).toString('base64') },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], imageContext: { languageHints: ['en'] } }] }),
    })
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw new Error(`DOCUMENT_PROVIDER_HTTP_${response.status}`)
    const responses = Array.isArray(body.responses) ? body.responses as Row[] : []
    const first = responses[0] ?? {}; const annotation = first.fullTextAnnotation as Row | undefined
    const annotations = Array.isArray(first.textAnnotations) ? first.textAnnotations as Row[] : []
    if (first.error) throw new Error('DOCUMENT_PROVIDER_FAILED')
    if (!responses.length) throw new Error('DOCUMENT_PROVIDER_INVALID_RESPONSE')
    return receiptLayout && annotation ? visionReceiptText(annotation) : String(annotation?.text ?? annotations[0]?.description ?? '')
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('DOCUMENT_PROVIDER_TIMEOUT')
    throw error
  } finally { clearTimeout(timeout) }
}

async function rasterizeStatementPage(page: PDFPageProxy) {
  const {createCanvas}=await import('@napi-rs/canvas');const viewport=page.getViewport({scale:1.5})
  const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));const context=canvas.getContext('2d')
  await page.render({canvas,canvasContext:context,viewport} as never).promise
  const sample=context.getImageData(0,0,canvas.width,canvas.height).data;let nonWhite=0
  for(let index=0;index<sample.length;index+=16){if(sample[index]<245||sample[index+1]<245||sample[index+2]<245)nonWhite+=1}
  return {blank:nonWhite<sample.length/16*0.001,bytes:new Uint8Array(canvas.toBuffer('image/png'))}
}

async function processReceipt(admin: SupabaseClient, job: Row, suppliedText?:string) {
  const target = await loadTarget(admin, job)
  const { data: prior } = await admin.from('bookkeeping_receipt_extractions').select('id,quality_status')
    .eq('business_id', String(job.business_id)).eq('receipt_id', target.receiptId)
    .eq('extraction_key', 'vision:v1').maybeSingle()
  if (prior) return { state: prior.quality_status === 'usable' ? 'completed' : 'needs_attention', reason: prior.quality_status === 'usable' ? null : 'DETAILS_UNAVAILABLE' }
  let text=suppliedText
  if(text===undefined){
    if(fileKind(target.bytes)==='pdf'){
      const pages=await readPdfPages(target.bytes,ORDINARY_VISION_PAGE_LIMIT)
      text=pages.map(p=>p.plain).join('\n')
      if(['bank_statement','card_statement'].includes(classifyDocumentText(text)))return {state:'needs_attention',reason:'STATEMENT_USE_DOCUMENT_INTAKE'}
    }else{
      if(!supportedImage(target.bytes,target.mimeType))return {state:'unreadable',reason:'MIME_CONTENT_MISMATCH'}
      text=await googleVision(target.bytes,true)
    }
  }
  if(!text.trim())return {state:'needs_attention',reason:'NO_READABLE_TEXT'}
  const parsed = parseReceiptText(text)
  if (parsed.reason) return { state: 'needs_attention', reason: parsed.reason }
  const { data, error } = await admin.rpc('worker_record_bookkeeping_receipt_extraction', {
    p_receipt_id: target.receiptId, p_extraction_key: 'vision:v1', p_provider: 'google_vision',
    p_merchant: parsed.merchant, p_occurred_on: parsed.occurredOn,
    p_total_amount_cents: parsed.totalAmountCents, p_raw_payload: { extractedText: text.slice(0, 20_000) },
  })
  if (error) throw new Error('CANONICAL_EXTRACTION_WRITE_FAILED')
  const result = data as Row | null
  return { state: result?.state === 'matched' || result?.state === 'retained' ? 'completed' : 'needs_attention',
    reason: result?.state === 'matched' || result?.state === 'retained' ? null : 'DETAILS_UNAVAILABLE' }
}

async function processStatement(admin: SupabaseClient, job: Row,ocr: (bytes:Uint8Array)=>Promise<string>) {
  const target = await loadTarget(admin, job)
  if (target.mimeType !== 'application/pdf' || !isPdf(target.bytes)) return { state: 'unreadable', reason: 'MIME_CONTENT_MISMATCH' }
  const pdf = await PDFDocument.load(target.bytes, { ignoreEncryption: true }).catch(() => null)
  if (!pdf) return { state: 'unreadable', reason: 'PDF_UNREADABLE' }
  const pageCount = pdf.getPageCount()
  if (pageCount < 1 || pageCount > STATEMENT_PAGE_LIMIT) return { state: 'needs_attention', reason: 'STATEMENT_PROTECTIVE_PAGE_BOUND' }
  const chunkCount = Math.ceil(pageCount / STATEMENT_CHUNK_PAGES)
  const startPage=Math.max(1,Number(job.next_page??1)),endPage=Math.min(pageCount,startPage+STATEMENT_CHUNK_PAGES-1)
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs')
  const source=await pdfjs.getDocument({data:target.bytes.slice()}).promise.catch(()=>null)
  if(!source)return {state:'unreadable',reason:'PDF_UNREADABLE'}
  let pages:{page:number;text:string}[]=[];let ocrNeeded=false
  const cached=await admin.from('statement_page_extractions').select('page_number,normalized_text,extraction_status')
    .eq('business_id',String(job.business_id)).eq('document_id',target.documentId).eq('extraction_version','statement-page:r3')
    .gte('page_number',startPage).lte('page_number',endPage)
  const cachedByPage=new Map((cached.data??[]).map(row=>[Number(row.page_number),row]))
  try { for(let pageNumber=startPage;pageNumber<=endPage;pageNumber+=1){const prior=cachedByPage.get(pageNumber)
    if(prior){pages.push({page:pageNumber,text:prior.extraction_status==='usable'?String(prior.normalized_text??''):''});continue}
    const page=await source.getPage(pageNumber),started=Date.now(),content=await page.getTextContent()
    let text=statementPageText(content.items.filter(item=>'str' in item) as PdfTextItem[]).trim(),method='native_text',status='usable'
    if(text.length<30){ocrNeeded=true;if(pageNumber>=startPage+STATEMENT_OCR_CHUNK_PAGES)break
      const rendered=await rasterizeStatementPage(page);method='ocr'
      if(rendered.blank){text='';status='blank'}else{text=(await ocr(rendered.bytes)).trim();status=text?'usable':'unreadable'}
    }
    const inserted=await admin.from('statement_page_extractions').insert({business_id:job.business_id,document_id:target.documentId,
      page_number:pageNumber,extraction_version:'statement-page:r3',method,extraction_status:status,normalized_text:text?text.slice(0,50000):null,
      provider:method==='ocr'?'google_vision':'pdfjs',duration_ms:Math.min(120000,Date.now()-started)})
    if(inserted.error?.code!=='23505'&&inserted.error)throw new Error('STATEMENT_PAGE_CACHE_FAILED')
    pages.push({page:pageNumber,text})
  }
  } finally { await source.destroy() }
  if(ocrNeeded&&pages.length>STATEMENT_OCR_CHUNK_PAGES)pages=pages.slice(0,STATEMENT_OCR_CHUNK_PAGES)
  const processedEnd=pages.at(-1)?.page??startPage
  // Reparse the bounded accumulated pages so repeated rows keep their occurrence
  // identity across chunks, retries, and equivalent document re-uploads.
  if(startPage>1){
    const accumulated=await admin.from('statement_page_extractions').select('page_number,normalized_text,extraction_status').eq('business_id',String(job.business_id)).eq('document_id',target.documentId).eq('extraction_version','statement-page:r3').lte('page_number',processedEnd).order('page_number')
    if(accumulated.error)throw new Error('STATEMENT_PAGE_CACHE_FAILED')
    pages=(accumulated.data??[]).map(row=>({page:Number(row.page_number),text:row.extraction_status==='usable'?String(row.normalized_text??''):''}))
  }
  if(pages.reduce((n,p)=>n+p.text.length,0)>2_000_000)throw new Error('DOCUMENT_TEXT_LIMIT')
  const nativeText=pages.some(page=>page.text.trim())
  if(!nativeText)return {state:'needs_attention',reason:'STATEMENT_OCR_UNREADABLE'}
  if(startPage>1&&!pages.some(page=>/statement\s+period/i.test(page.text))){const prior=await admin.from('statement_periods')
      .select('institution_name,masked_account,period_start,period_end').eq('business_id',String(job.business_id))
      .eq('document_id',target.documentId).order('source_page_end',{ascending:false}).limit(1).maybeSingle()
    if(prior.data?.period_start&&prior.data?.period_end)pages[0].text=`Institution: ${prior.data.institution_name}\n${prior.data.masked_account?`Account ending in ${prior.data.masked_account}\n`:''}Statement Period: ${prior.data.period_start} - ${prior.data.period_end}\n${pages[0].text}`
  }
  const periods=parseStatementPages({pages,documentClass:target.documentClass??'bank_statement',documentSha256:String(job.document_sha256)})
  for(const period of periods)if(await documentMayOverlap(admin,String(job.business_id),period.transactions,'statement',period))return {state:'needs_attention',reason:'DOCUMENT_POSSIBLE_DUPLICATES'}
  let imported=0,ambiguous=0
  for(const period of periods){ambiguous+=period.ambiguousRowCount;const payload=periodToRpc(period)
    const result=await admin.rpc('ingest_statement_period',{p_job_id:job.id,p_period:{...payload.period,lease_id:job.lease_id},p_rows:payload.rows})
    if(result.error)throw new Error('STATEMENT_CANONICAL_INGESTION_FAILED');if(result.data?.review_required)return {state:'needs_attention',reason:'DOCUMENT_POSSIBLE_DUPLICATES'};imported+=Number((result.data as Row)?.processed??0)}
  if(processedEnd<pageCount)return {state:'continue',reason:null,nextPage:processedEnd+1}
  const outcome=imported>0?(ambiguous>0?'needs_attention':'completed'):'needs_attention'
  const { error } = await admin.from('document_processing_results').insert({
    business_id: job.business_id,document_id: target.documentId,job_id: job.id,
    document_sha256: job.document_sha256,processor_version: job.processor_version,
    document_class: target.documentClass ?? 'bank_statement',page_count: pageCount,chunk_count: chunkCount,
    outcome: outcome==='completed'?'inspected':'needs_attention',result_metadata: { nativeTextAttempted: true,
      chunkPages: STATEMENT_CHUNK_PAGES,transactionCount:imported,ambiguousRowCount:ambiguous },
  })
  if (error?.code !== '23505' && error) throw new Error('DOCUMENT_RESULT_WRITE_FAILED')
  return { state: outcome, reason: outcome==='completed'?null:imported?'STATEMENT_ROWS_AMBIGUOUS':'STATEMENT_NO_TRANSACTIONS' }
}

async function processIntake(admin:SupabaseClient,job:Row){
  const target=await loadTarget(admin,job),kind=fileKind(target.bytes)
  let text='',documentClass='unknown',transactionCount=0
  if(kind==='pdf'){
    const pages=await readPdfPages(target.bytes);text=pages.map(p=>p.plain).join('\n');documentClass=classifyDocumentText(text)
  }else if(['png','jpeg','webp'].includes(kind)){
    text=await googleVision(target.bytes,true);documentClass=classifyDocumentText(text)
  }else if(kind==='text'){
    let rows;try{rows=parseStructuredFile(target.bytes)}catch{return {state:'needs_attention',reason:'DOCUMENT_ROWS_UNCLEAR'}}
    if(await documentMayOverlap(admin,String(job.business_id),rows,'csv'))return {state:'needs_attention',reason:'DOCUMENT_POSSIBLE_DUPLICATES'}
    const imported=await admin.rpc('worker_import_document_rows',{p_job_id:job.id,p_lease_id:job.lease_id,p_rows:rows.map(row=>({
      row_number:row.rowNumber,transaction_date:row.transactionDate,amount_cents:row.amountCents,currency:row.currency,
      raw_description:row.rawDescription,normalized_description:row.normalizedDescription,normalized_fingerprint:row.normalizedFingerprint,
      occurrence:row.occurrence,source_fingerprint:row.sourceFingerprint,legacy_dedupe_hash:row.legacyDedupeHash}))})
    if(imported.error)throw new Error('DOCUMENT_CANONICAL_IMPORT_FAILED')
    if(imported.data?.review_required)return {state:'needs_attention',reason:'DOCUMENT_POSSIBLE_DUPLICATES'}
    transactionCount=Number(imported.data?.processed??0);documentClass='transaction_file'
  }
  if(documentClass==='unknown')return {state:'needs_attention',reason:'DOCUMENT_TYPE_UNCLEAR'}
  if(documentClass==='bank_statement'||documentClass==='card_statement'){
    if(kind!=='pdf')return {state:'needs_attention',reason:'STATEMENT_PDF_NEEDED'}
    const updated=await admin.from('business_documents').update({document_class:documentClass,mime_type:'application/pdf'}).eq('id',target.documentId).eq('business_id',String(job.business_id))
    if(updated.error)throw new Error('DOCUMENT_CLASSIFICATION_FAILED')
    return processStatement(admin,job,googleVision)
  }
  if(documentClass==='receipt'){
    const routed=await admin.rpc('worker_route_document_receipt',{p_job_id:job.id,p_lease_id:job.lease_id,p_mime:kind==='pdf'?'application/pdf':`image/${kind}`})
    if(routed.error||typeof routed.data!=='string')throw new Error('DOCUMENT_RECEIPT_ROUTE_FAILED')
    await drainCanonicalDocumentJobs({admin,receiptId:routed.data,receiptText:text})
  }
  const result=await admin.from('document_processing_results').insert({business_id:job.business_id,document_id:target.documentId,job_id:job.id,
    document_sha256:job.document_sha256,processor_version:job.processor_version,document_class:documentClass,outcome:'inspected',result_metadata:{transactionCount}})
  if(result.error&&result.error.code!=='23505')throw new Error('DOCUMENT_RESULT_WRITE_FAILED')
  return {state:'completed',reason:null}
}

export async function drainCanonicalDocumentJobs(input: { admin?: SupabaseClient; batchSize?: number;
  statementOcr?: (bytes:Uint8Array)=>Promise<string>; receiptId?: string; documentId?:string; receiptText?:string } = {}) {
  const admin = input.admin ?? createServerAdminSupabase(); const leaseId = randomUUID()
  const batchSize = Math.max(1, Math.min(CANONICAL_DOCUMENT_BATCH_MAX, Math.trunc(input.batchSize ?? 5)))
  const { data, error } = input.documentId
    ? await admin.rpc('claim_customer_document_job',{p_document_id:input.documentId,p_lease_id:leaseId})
    : input.receiptId
    ? await admin.rpc('claim_canonical_receipt_job', { p_receipt_id: input.receiptId, p_lease_id: leaseId })
    : await admin.rpc('claim_receipt_processing_jobs_by_type', { p_lease_id: leaseId,
    p_job_types: ['canonical_receipt_extraction','statement_inspection','document_intake'],p_limit: batchSize,p_lease_seconds: 180 })
  if (error) throw new Error('DOCUMENT_PROCESSING_CLAIM_FAILED')
  const claimed = asRows(data); let completed = 0; let attention = 0; let unreadable = 0; let retried = 0
  for (const job of claimed) {
    try {
      const result = job.job_type === 'document_intake' ? await processIntake(admin,job) : job.job_type === 'statement_inspection' ? await processStatement(admin,job,input.statementOcr??googleVision) : await processReceipt(admin,job,input.receiptText)
      if(result.state==='continue'&&'nextPage' in result){
        const continuation=await admin.rpc('continue_document_processing_job',{p_job_id:job.id,p_lease_id:leaseId,p_next_page:result.nextPage})
        if(continuation.error||continuation.data!==true)throw new Error('DOCUMENT_PROCESSING_LEASE_LOST')
        continue
      }
      const { data: finished, error: finishError } = await admin.rpc('finish_receipt_processing_job', {
        p_job_id: job.id,p_lease_id: leaseId,p_state: result.state,p_terminal_reason: result.reason })
      if (finishError || finished !== true) throw new Error('DOCUMENT_PROCESSING_LEASE_LOST')
      if (result.state === 'completed') completed += 1
      else if (result.state === 'unreadable') unreadable += 1
      else attention += 1
    } catch (processingError) {
      const code = safeErrorCode(processingError)
      // A fingerprint mismatch is an integrity failure, not a transient
      // provider failure. Retrying the same immutable object cannot repair it.
      if(['DOCUMENT_PAGE_LIMIT','DOCUMENT_TEXT_LIMIT'].includes(code)){await admin.rpc('finish_receipt_processing_job',{p_job_id:job.id,p_lease_id:leaseId,p_state:'needs_attention',p_terminal_reason:code});attention+=1;continue}
      const terminal = ['DOCUMENT_SIZE_MISMATCH','MIME_CONTENT_MISMATCH','PDF_UNREADABLE','NO_READABLE_TEXT','DOCUMENT_HASH_MISMATCH'].includes(code)
      if (terminal) {
        await admin.rpc('finish_receipt_processing_job', { p_job_id: job.id,p_lease_id: leaseId,
          p_state: 'unreadable',p_terminal_reason: code }); unreadable += 1
      } else {
        await admin.rpc('retry_receipt_processing_job', { p_job_id: job.id,p_lease_id: leaseId,p_error_code: code }); retried += 1
      }
    }
  }
  return { claimed: claimed.length,completed,needs_attention: attention,unreadable,retried }
}

export async function documentQueueHealth(admin: SupabaseClient = createServerAdminSupabase()) {
  const { data, error } = await admin.from('document_processing_observability')
    .select('job_type,state,job_count,oldest_created_at,max_attempt_count,max_recovery_count,last_error_category')
  if (error) throw new Error('DOCUMENT_QUEUE_HEALTH_UNAVAILABLE')
  const now = Date.now()
  return (data ?? []).map((row) => ({ ...row, oldest_age_seconds: row.oldest_created_at
    ? Math.max(0, Math.floor((now - new Date(row.oldest_created_at).getTime()) / 1000)) : null,
    stuck: row.state === 'processing' && row.oldest_created_at
      ? now - new Date(row.oldest_created_at).getTime() > 15 * 60_000 : false }))
}
