import 'server-only'
import {readPdfPages} from './pdf-reader'
import {visionReceiptPages,type ReceiptPage} from './receipt-boundaries'

type OcrResult={annotation?:Record<string,unknown>;text:string}
/** Native text stays native. Image-only intake pages use bounded OCR and map
 * visual coordinates back to PDF points so subsequent crops retain lineage. */
export async function readIntakePdfEvidence(bytes:Uint8Array,ocr:(bytes:Uint8Array)=>Promise<OcrResult>):Promise<ReceiptPage[]>{
 const pages=await readPdfPages(bytes)
 const pending=pages.filter(p=>p.plain.trim().length<25).slice(0,10)
 if(!pending.length)return pages.map(p=>({...p,text:p.plain}))
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),{createCanvas}=await import('@napi-rs/canvas')
 const pdf=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}).promise
 const out:ReceiptPage[]=pages.map(p=>({...p,text:p.plain}))
 try{for(const native of pending){
  const page=await pdf.getPage(native.page),base=page.getViewport({scale:1})
  const scale=Math.min(1.5,3200/Math.max(base.width,base.height)),viewport=page.getViewport({scale})
  const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height))
  await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport} as never).promise
  const evidence=await ocr(new Uint8Array(canvas.toBuffer('image/png')))
  const found=evidence.annotation?visionReceiptPages(evidence.annotation)[0]:null
  const sx=found?.width?base.width/found.width:1,sy=found?.height?base.height/found.height:1
  out[native.page-1]={page:native.page,width:base.width,height:base.height,text:found?.text??evidence.text,
   words:found?.words.map(w=>({...w,x:w.x*sx,y:w.y*sy,width:w.width*sx,height:w.height*sy}))??[]}
 }}finally{await pdf.destroy()}
 return out
}
