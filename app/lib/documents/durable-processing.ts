import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerAdminSupabase } from '../../../utils/supabase/admin'
import { parseStatementPages,periodToRpc } from './statement-intelligence'

type Row = Record<string, unknown>
export const CANONICAL_DOCUMENT_BATCH_MAX = 10
export const ORDINARY_VISION_PAGE_LIMIT = 10
export const STATEMENT_PAGE_LIMIT = 500
export const STATEMENT_CHUNK_PAGES = 25
export const RECEIPT_FILE_BYTES_MAX = 20 * 1024 * 1024
export const STATEMENT_FILE_BYTES_MAX = 100 * 1024 * 1024
const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate'

const asRows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : value ? [value as Row] : []
const safeErrorCode = (error: unknown) => {
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
  const { data: blob, error: downloadError } = await admin.storage.from('receipts').download(String(data.storage_path))
  if (downloadError || !blob) throw new Error('DOCUMENT_DOWNLOAD_FAILED')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (createHash('sha256').update(bytes).digest('hex') !== job.document_sha256) throw new Error('DOCUMENT_HASH_MISMATCH')
  return { bytes,receiptId,documentId,storagePath:String(data.storage_path),mimeType:String(data.mime_type),
    originalName:typeof data.original_name==='string'?data.original_name:null,
    documentClass:typeof data.document_class==='string'?data.document_class:null }
}

async function googleVision(bytes: Uint8Array) {
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
    if (!response.ok) throw new Error('DOCUMENT_PROVIDER_FAILED')
    const responses = Array.isArray(body.responses) ? body.responses as Row[] : []
    const first = responses[0] ?? {}; const annotation = first.fullTextAnnotation as Row | undefined
    const annotations = Array.isArray(first.textAnnotations) ? first.textAnnotations as Row[] : []
    return String(annotation?.text ?? annotations[0]?.description ?? '')
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('DOCUMENT_PROVIDER_TIMEOUT')
    throw error
  } finally { clearTimeout(timeout) }
}

export function parseReceiptText(text: string) {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean)
  const joined = lines.join(' ')
  let date: string | null = null
  let match = joined.match(/(\d{4})[\/\-.](\d{2})[\/\-.](\d{2})/)
  if (match && validDate(match[1], match[2], match[3])) date = `${match[1]}-${match[2]}-${match[3]}`
  if (!date) {
    match = joined.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/)
    if (match) { const month = pad(match[1]); const day = pad(match[2]); if (validDate(match[3], month, day)) date = `${match[3]}-${month}-${day}` }
  }
  let total: number | null = null
  for (const line of lines.filter((value) => /\b(total|amount due)\b/i.test(value))) {
    const money = [...line.matchAll(/(?:\$|USD\s*)?([0-9]{1,9}(?:,[0-9]{3})*\.\d{2})\b/g)]
    if (money.length) { total = Math.round(Number(money.at(-1)![1].replace(/,/g, '')) * 100); break }
  }
  const generic = /^(receipt|invoice|date|total|subtotal|amount|thank you)$/i
  const merchant = lines.map((line) => line.replace(/[^a-zA-Z0-9&' .-]+/g, ' ').trim())
    .find((line) => line.length >= 3 && line.length <= 120 && !generic.test(line)
      && !/\$|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(line)) ?? null
  return { merchant, occurredOn: date, totalAmountCents: total }
}

function pad(value: string) { return String(Number(value)).padStart(2, '0') }
function validDate(year: string, month: string, day: string) {
  const candidate = new Date(`${year}-${month}-${day}T00:00:00Z`)
  return Number(year) >= 2000 && Number(year) <= 2100 && !Number.isNaN(candidate.getTime())
    && candidate.getUTCFullYear() === Number(year) && candidate.getUTCMonth() + 1 === Number(month)
    && candidate.getUTCDate() === Number(day)
}

async function processReceipt(admin: SupabaseClient, job: Row) {
  const target = await loadTarget(admin, job)
  const { data: prior } = await admin.from('bookkeeping_receipt_extractions').select('id,quality_status')
    .eq('business_id', String(job.business_id)).eq('receipt_id', target.receiptId)
    .eq('extraction_key', 'vision:v1').maybeSingle()
  if (prior) return { state: prior.quality_status === 'usable' ? 'completed' : 'needs_attention', reason: prior.quality_status === 'usable' ? null : 'DETAILS_UNAVAILABLE' }
  if (target.mimeType === 'application/pdf') {
    if (!isPdf(target.bytes)) return { state: 'unreadable', reason: 'MIME_CONTENT_MISMATCH' }
    const pdf = await PDFDocument.load(target.bytes, { ignoreEncryption: true }).catch(() => null)
    if (!pdf) return { state: 'unreadable', reason: 'PDF_UNREADABLE' }
    const pages = pdf.getPageCount()
    await admin.rpc('worker_record_bookkeeping_receipt_extraction', { p_receipt_id: target.receiptId,
      p_extraction_key: 'document-pdf:v1', p_provider: 'document_pipeline', p_merchant: null,
      p_occurred_on: null, p_total_amount_cents: null,
      p_raw_payload: { pageCount: pages, visionPageLimit: ORDINARY_VISION_PAGE_LIMIT } })
    return { state: 'needs_attention', reason: pages > ORDINARY_VISION_PAGE_LIMIT ? 'ORDINARY_DOCUMENT_PAGE_LIMIT' : 'PDF_TEXT_UNAVAILABLE' }
  }
  if (!supportedImage(target.bytes, target.mimeType)) return { state: 'unreadable', reason: 'MIME_CONTENT_MISMATCH' }
  const text = await googleVision(target.bytes)
  if (!text.trim()) return { state: 'unreadable', reason: 'NO_READABLE_TEXT' }
  const parsed = parseReceiptText(text)
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

async function processStatement(admin: SupabaseClient, job: Row) {
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
  const pages:{page:number;text:string}[]=[]
  for(let pageNumber=startPage;pageNumber<=endPage;pageNumber+=1){const page=await source.getPage(pageNumber);const content=await page.getTextContent()
    const text=content.items.map(item=>'str' in item?item.str:'').filter(Boolean).join('\n');pages.push({page:pageNumber,text})}
  const nativeText=pages.some(page=>page.text.trim())
  if(!nativeText)return {state:'needs_attention',reason:'STATEMENT_OCR_REQUIRED'}
  if(startPage>1&&!pages.some(page=>/statement\s+period/i.test(page.text))){const prior=await admin.from('statement_periods')
      .select('institution_name,masked_account,period_start,period_end').eq('business_id',String(job.business_id))
      .eq('document_id',target.documentId).order('source_page_end',{ascending:false}).limit(1).maybeSingle()
    if(prior.data?.period_start&&prior.data?.period_end)pages[0].text=`Institution: ${prior.data.institution_name}\n${prior.data.masked_account?`Account ending in ${prior.data.masked_account}\n`:''}Statement Period: ${prior.data.period_start} - ${prior.data.period_end}\n${pages[0].text}`
  }
  const periods=parseStatementPages({pages,documentClass:target.documentClass??'bank_statement',documentSha256:String(job.document_sha256)})
  let imported=0,ambiguous=0
  for(const period of periods){ambiguous+=period.ambiguousRowCount;const payload=periodToRpc(period)
    const result=await admin.rpc('ingest_statement_period',{p_job_id:job.id,p_period:payload.period,p_rows:payload.rows})
    if(result.error)throw new Error('STATEMENT_CANONICAL_INGESTION_FAILED');imported+=Number((result.data as Row)?.imported??0)}
  if(endPage<pageCount)return {state:'continue',reason:null,nextPage:endPage+1}
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

export async function drainCanonicalDocumentJobs(input: { admin?: SupabaseClient; batchSize?: number } = {}) {
  const admin = input.admin ?? createServerAdminSupabase(); const leaseId = randomUUID()
  const batchSize = Math.max(1, Math.min(CANONICAL_DOCUMENT_BATCH_MAX, Math.trunc(input.batchSize ?? 5)))
  const { data, error } = await admin.rpc('claim_receipt_processing_jobs_by_type', { p_lease_id: leaseId,
    p_job_types: ['canonical_receipt_extraction','statement_inspection'],p_limit: batchSize,p_lease_seconds: 180 })
  if (error) throw new Error('DOCUMENT_PROCESSING_CLAIM_FAILED')
  const claimed = asRows(data); let completed = 0; let attention = 0; let unreadable = 0; let retried = 0
  for (const job of claimed) {
    try {
      const result = job.job_type === 'statement_inspection' ? await processStatement(admin, job) : await processReceipt(admin, job)
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
      const terminal = ['MIME_CONTENT_MISMATCH','PDF_UNREADABLE','NO_READABLE_TEXT'].includes(code)
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
