import 'server-only'
import {createHash} from 'node:crypto'
import type {SupabaseClient} from '@supabase/supabase-js'
import {receiptCrop} from './receipt-crops'
import {fileKind} from './file-validation'
import type {ReceiptRegion} from './receipt-boundaries'

/** Derived receipts keep only their immutable source and crop description. No
 * worker writes another persistent private object that could outlive deletion.
 * Both original bytes and the reproducible derived bytes are authenticated. */
export async function derivedReceiptSource(db:SupabaseClient,receipt:{id:string;business_id:string;upload_fingerprint:string;bytes:number}){
 const lineage=await db.from('receipt_source_regions').select('document_id,source_sha256,regions,crop_version')
  .eq('business_id',receipt.business_id).eq('receipt_id',receipt.id).order('created_at').limit(1).maybeSingle()
 if(lineage.error)throw new Error('RECEIPT_SOURCE_UNAVAILABLE')
 if(!lineage.data)return null
 if(lineage.data.crop_version!=='original-marks:v1')throw new Error('RECEIPT_SOURCE_VERSION_UNAVAILABLE')
 const source=await db.from('business_documents').select('storage_path,upload_fingerprint,bytes')
  .eq('business_id',receipt.business_id).eq('id',lineage.data.document_id).single()
 if(source.error||!source.data||source.data.upload_fingerprint!==lineage.data.source_sha256)throw new Error('RECEIPT_SOURCE_STALE')
 const expected=Number(source.data.bytes)
 if(!Number.isSafeInteger(expected)||expected<1||expected>100*1024*1024)throw new Error('RECEIPT_SOURCE_SIZE_MISMATCH')
 const metadata=await db.storage.from('receipts').info(source.data.storage_path)
 if(metadata.error||Number(metadata.data?.size??metadata.data?.metadata?.size)!==expected)throw new Error('RECEIPT_SOURCE_SIZE_MISMATCH')
 const downloaded=await db.storage.from('receipts').download(source.data.storage_path)
 if(downloaded.error||!downloaded.data)throw new Error('RECEIPT_SOURCE_UNAVAILABLE')
 const original=new Uint8Array(await downloaded.data.arrayBuffer())
 if(original.length!==expected||createHash('sha256').update(original).digest('hex')!==lineage.data.source_sha256)throw new Error('RECEIPT_SOURCE_HASH_MISMATCH')
 const crop=await receiptCrop(original,fileKind(original),{text:'',regions:lineage.data.regions as ReceiptRegion[]})
 if(crop.bytes.length!==receipt.bytes||createHash('sha256').update(crop.bytes).digest('hex')!==receipt.upload_fingerprint)throw new Error('RECEIPT_CROP_HASH_MISMATCH')
 return crop
}
