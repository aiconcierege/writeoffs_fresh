import 'server-only'
import {PDFDocument} from 'pdf-lib'
import type {LogicalReceipt} from './receipt-boundaries'

/** Crops contain the actual original marks, not re-rendered OCR text. Their byte
 * hashes therefore retain the normal private-upload integrity boundary. */
export async function receiptCrop(bytes:Uint8Array,kind:string,receipt:LogicalReceipt){
 if(kind==='pdf'){
  const source=await PDFDocument.load(bytes),out=await PDFDocument.create()
  out.setCreationDate(new Date('2000-01-01T00:00:00Z'));out.setModificationDate(new Date('2000-01-01T00:00:00Z'))
  out.setProducer('WriteOffs receipt evidence');out.setCreator('WriteOffs')
  for(const r of receipt.regions){
   const page=source.getPage(r.page-1)
   if(page.getRotation().angle!==0)throw new Error('RECEIPT_ROTATION_REVIEW_REQUIRED')
   const embedded=await out.embedPage(page,{left:r.x,right:r.x+r.width,top:page.getHeight()-r.y,bottom:page.getHeight()-r.y-r.height})
   out.addPage([r.width,r.height]).drawPage(embedded)
  }
  return {bytes:new Uint8Array(await out.save()),mime:'application/pdf'}
 }
 if(receipt.regions.length!==1)throw new Error('RECEIPT_IMAGE_BOUNDARIES_UNCLEAR')
 const{createCanvas,loadImage}=await import('@napi-rs/canvas'),image=await loadImage(Buffer.from(bytes)),r=receipt.regions[0]
 const canvas=createCanvas(Math.ceil(r.width),Math.ceil(r.height))
 canvas.getContext('2d').drawImage(image,r.x,r.y,r.width,r.height,0,0,r.width,r.height)
 return {bytes:new Uint8Array(canvas.toBuffer('image/png')),mime:'image/png'}
}
