import {describe,it,expect,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {PDFDocument,StandardFonts} from 'pdf-lib'
import type {SupabaseClient} from '@supabase/supabase-js'
import {derivedReceiptSource} from '../../app/lib/documents/receipt-source'
import {receiptCrop} from '../../app/lib/documents/receipt-crops'
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex')
async function fixture(){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([600,800])
 page.drawText('Receipt source',{x:20,y:700,font,size:12})
 const original=await pdf.save(),regions=[{page:1,x:10,y:80,width:200,height:100}]
 const crop=await receiptCrop(original,'pdf',{text:'',regions})
 const receipt={id:'receipt',business_id:'owner',upload_fingerprint:hash(crop.bytes),bytes:crop.bytes.length}
 const lineage={document_id:'source',source_sha256:hash(original),regions,crop_version:'original-marks:v1'}
 const query={select:vi.fn(),eq:vi.fn(),order:vi.fn(),limit:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:lineage}),single:vi.fn().mockResolvedValue({data:{storage_path:'receipts/owner/original',upload_fingerprint:hash(original),bytes:original.length}})}
 for(const name of ['select','eq','order','limit'] as const)query[name].mockReturnValue(query)
 const download=vi.fn().mockResolvedValue({data:new Blob([original as BlobPart])}),upload=vi.fn()
 const db={from:vi.fn(()=>query),storage:{from:vi.fn(()=>({info:vi.fn().mockResolvedValue({data:{size:original.length}}),download,upload}))}} as unknown as SupabaseClient
 return{db,query,receipt,original,crop,lineage,download,upload}
}
describe('derived receipt source integrity',()=>{
 it('recreates exact independent crop bytes without writing any private object',async()=>{
  const f=await fixture();expect(await derivedReceiptSource(f.db,f.receipt)).toEqual(f.crop)
  expect(f.query.eq).toHaveBeenCalledWith('business_id','owner');expect(f.query.eq).toHaveBeenCalledWith('receipt_id','receipt')
  expect(f.download).toHaveBeenCalledWith('receipts/owner/original');expect(f.upload).not.toHaveBeenCalled()
 })
 it('leaves ordinary receipts on their existing storage path',async()=>{
  const f=await fixture();f.query.maybeSingle.mockResolvedValue({data:null})
  expect(await derivedReceiptSource(f.db,f.receipt)).toBeNull();expect(f.download).not.toHaveBeenCalled()
 })
 it('fails closed when ownership/source metadata is unavailable',async()=>{
  const f=await fixture();f.query.single.mockResolvedValue({data:null})
  await expect(derivedReceiptSource(f.db,f.receipt)).rejects.toThrow('RECEIPT_SOURCE_STALE')
  expect(f.download).not.toHaveBeenCalled()
 })
 it('rejects tampered original bytes',async()=>{
  const f=await fixture(),bad=f.original.slice();bad[20]^=1;f.download.mockResolvedValue({data:new Blob([bad as BlobPart])})
  await expect(derivedReceiptSource(f.db,f.receipt)).rejects.toThrow('RECEIPT_SOURCE_HASH_MISMATCH')
 })
 it('rejects changed crop identity instead of returning different evidence',async()=>{
  const f=await fixture();f.receipt.upload_fingerprint='0'.repeat(64)
  await expect(derivedReceiptSource(f.db,f.receipt)).rejects.toThrow('RECEIPT_CROP_HASH_MISMATCH')
 })
})
