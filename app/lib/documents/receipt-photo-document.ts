import { PDFDocument } from 'pdf-lib'
import { fileKind } from './file-validation'
import { CUSTOMER_PHOTO_GROUPING } from './photo-grouping'

const MAX_BYTES=20*1024*1024
const epoch=new Date('2000-01-01T00:00:00Z')
/** An explicit multi-photo document retains every original as a PDF attachment.
 * Rendered pages are orientation-normalized derivatives, never replacement
 * evidence. Fixed metadata makes identical ordered input bytes retry-stable. */
export async function receiptPhotoDocument(files:File[]):Promise<File>{
 if(!files.length||files.length>10)throw Error('Choose between 1 and 10 photos.')
 const pdf=await PDFDocument.create()
 pdf.setCreationDate(epoch);pdf.setModificationDate(epoch)
 pdf.setProducer('WriteOffs receipt photo handoff');pdf.setCreator('WriteOffs')
 pdf.setSubject(CUSTOMER_PHOTO_GROUPING)
 let originalBytes=0
 for(const file of files){
  originalBytes+=file.size
  if(!file.size||originalBytes>MAX_BYTES)throw Error('Choose photos totaling less than 20 MB.')
  const bytes=new Uint8Array(await file.arrayBuffer()),kind=fileKind(bytes)
  const heif=String.fromCharCode(...bytes.slice(4,12)).startsWith('ftyp')
    &&/heic|heix|hevc|hevx|mif1|msf1/.test(String.fromCharCode(...bytes.slice(8,40)))
  if(!['jpeg','png','webp'].includes(kind)&&!heif)throw Error('Choose receipt photos, not a PDF or other file, for this option.')
  let bitmap:ImageBitmap
  try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'})}
  catch{throw Error(heif?'This browser can’t read this HEIC photo. Use Take a photo, or choose a JPEG or PNG photo.':'I couldn’t read this image. Try another photo.')}
  try{
   if(bitmap.width*bitmap.height>60_000_000)throw Error('This image is too large. Choose a smaller photo.')
   const scale=Math.min(1,3200/Math.max(bitmap.width,bitmap.height))
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale))
   const context=canvas.getContext('2d');if(!context)throw Error('Image processing is unavailable.')
   context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height)
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Image processing failed.')),'image/jpeg',.94))
   const image=await pdf.embedJpg(await blob.arrayBuffer()),page=pdf.addPage([canvas.width,canvas.height])
   page.drawImage(image,{x:0,y:0,width:canvas.width,height:canvas.height})
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('')
   await pdf.attach(bytes,`${hash}.${heif?'heic':kind}`,{mimeType:heif?'image/heic':`image/${kind}`,creationDate:epoch,modificationDate:epoch,description:'Unmodified original receipt photo'})
  }finally{bitmap.close()}
 }
 const bytes=await pdf.save({useObjectStreams:false})
 if(bytes.byteLength>MAX_BYTES)throw Error('These photos are too large together. Choose fewer photos.')
 return new File([new Uint8Array(bytes)],'Receipt photos.pdf',{type:'application/pdf',lastModified:epoch.getTime()})
}
