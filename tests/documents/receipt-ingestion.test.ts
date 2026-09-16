import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseReceiptText, visionReceiptText } from '../../app/lib/documents/receipt-text'
import { drainCanonicalDocumentJobs, googleVision } from '../../app/lib/documents/durable-processing'
import type { SupabaseClient } from '@supabase/supabase-js'

afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers()})
describe('receipt OCR facts',()=>{
  it('reads dates when OCR separates punctuation into words',()=>{
    for(const visible of ['September 8 , 2026','09 / 08 / 2026','2026 - 09 - 08'])
      expect(parseReceiptText(`Shop\n${visible}\nTotal $12.00`).occurredOn).toBe('2026-09-08')
  })
  it('reads positive exact cents and normalizes typographic apostrophes and US dates',()=>{
    expect(parseReceiptText('McDonald’s\n09/08/2026\nSubtotal 11.10\nTax 0.90\nTotal\n$12.00')).toEqual({merchant:"McDonald's",occurredOn:'2026-09-08',totalAmountCents:1200,reason:null})
    expect(parseReceiptText("McDonald's\nSeptember 8, 2026\nTOTAL $9.54")).toMatchObject({occurredOn:'2026-09-08',totalAmountCents:954,reason:null})
  })
  it('does not invent dates or choose an amount from conflicting totals',()=>{
    expect(parseReceiptText('Shop\n02/30/2026\nTotal 12.00')).toMatchObject({occurredOn:null})
    expect(parseReceiptText('Shop\n09/08/2026\nTotal 12.00\nTotal 19.00')).toMatchObject({totalAmountCents:null,reason:'RECEIPT_TOTAL_AMBIGUOUS'})
    expect(parseReceiptText('Shop\n09/08/2026\nSubtotal 12.00\nCard ending 1234')).toMatchObject({totalAmountCents:null})
  })
  it('stops two receipts before producing canonical extraction fields',()=>{
    expect(parseReceiptText('STARBUCKS\n09/08/2026\nTotal $4.33\nUber\nSeptember 11, 2026\nTotal $5.40')).toMatchObject({reason:'MULTIPLE_RECEIPTS_DETECTED',totalAmountCents:null,occurredOn:null})
  })
  it('reassembles separated OCR columns using visible word coordinates',()=>{
    const word=(text:string,x:number,y:number)=>({symbols:[{text}],boundingBox:{vertices:[{x,y},{x:x+40,y},{x:x+40,y:y+15},{x,y:y+15}]}})
    const text=visionReceiptText({pages:[{blocks:[{paragraphs:[{words:[word('Shop',0,0),word('Total',0,100),word('$12.00',300,100)]}]}]}]})
    expect(text).toBe('Shop\nTotal $12.00')
  })
})

function workerFixture() {
  const bytes=Uint8Array.from([0x89,0x50,0x4e,0x47,1,2,3])
  const job={id:'job',business_id:'tenant-a',receipt_id:'receipt-a',job_type:'canonical_receipt_extraction',document_sha256:createHash('sha256').update(bytes).digest('hex')}
  const query={select:vi.fn(),eq:vi.fn(),single:vi.fn(),maybeSingle:vi.fn()}
  query.select.mockReturnValue(query);query.eq.mockReturnValue(query)
  query.single.mockResolvedValue({data:{id:'receipt-a',upload_fingerprint:job.document_sha256,storage_path:'private/object',mime_type:'image/png'},error:null})
  query.maybeSingle.mockResolvedValue({data:null,error:null})
  const rpc=vi.fn(async(name:string)=>({data:name.startsWith('claim_')?[job]:name==='worker_record_bookkeeping_receipt_extraction'?{state:'matched'}:true,error:null}))
  const download=vi.fn().mockResolvedValue({data:new Blob([bytes]),error:null})
  const admin={rpc,from:vi.fn(()=>query),storage:{from:vi.fn(()=>({download}))}} as unknown as SupabaseClient
  vi.stubEnv('GCV_API_KEY','unit-test-placeholder')
  return {admin,rpc,query,download}
}
describe('durable receipt worker',()=>{
  it('retrieves a tenant-scoped PNG, invokes extraction and completes canonical matching',async()=>{
    const f=workerFixture();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({responses:[{fullTextAnnotation:{text:"McDonald's\n09/08/2026\nTotal $12.00"}}]})))
    expect(await drainCanonicalDocumentJobs({admin:f.admin,receiptId:'receipt-a'})).toMatchObject({completed:1,retried:0})
    expect(f.rpc).toHaveBeenCalledWith('claim_canonical_receipt_job',expect.objectContaining({p_receipt_id:'receipt-a'}))
    expect(f.query.eq).toHaveBeenCalledWith('business_id','tenant-a')
    expect(f.rpc).toHaveBeenCalledWith('worker_record_bookkeeping_receipt_extraction',expect.objectContaining({p_merchant:"McDonald's",p_occurred_on:'2026-09-08',p_total_amount_cents:1200}))
    expect(f.rpc).toHaveBeenCalledWith('finish_receipt_processing_job',expect.objectContaining({p_state:'completed'}))
  })
  it('does not persist a combined extraction for multiple receipts',async()=>{
    const f=workerFixture();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({responses:[{fullTextAnnotation:{text:'Cafe\n09/08/2026\nTotal 4.33\nCab\nSeptember 11, 2026\nTotal 5.40'}}]})))
    expect(await drainCanonicalDocumentJobs({admin:f.admin})).toMatchObject({needs_attention:1})
    expect(f.rpc).not.toHaveBeenCalledWith('worker_record_bookkeeping_receipt_extraction',expect.anything())
    expect(f.rpc).toHaveBeenCalledWith('finish_receipt_processing_job',expect.objectContaining({p_terminal_reason:'MULTIPLE_RECEIPTS_DETECTED'}))
  })
  it.each([{responses:[{error:{code:503}}]},{}])('retries malformed/provider errors instead of treating them as unreadable receipts',async body=>{
    const f=workerFixture();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(body)))
    expect(await drainCanonicalDocumentJobs({admin:f.admin})).toMatchObject({retried:1,completed:0})
    expect(f.rpc).toHaveBeenCalledWith('retry_receipt_processing_job',expect.objectContaining({p_error_code:expect.stringMatching(/^DOCUMENT_PROVIDER_/)}))
  })
  it('bounds provider time and makes a timeout retryable',async()=>{
    vi.useFakeTimers();vi.stubEnv('GCV_API_KEY','unit-test-placeholder')
    vi.stubGlobal('fetch',vi.fn((_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))))))
    const promise=expect(googleVision(new Uint8Array([1]))).rejects.toThrow('DOCUMENT_PROVIDER_TIMEOUT')
    await vi.advanceTimersByTimeAsync(20000);await promise
  })
})
