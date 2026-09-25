import {describe,it,expect,vi} from 'vitest'
import {PDFDocument,StandardFonts} from 'pdf-lib'
import {createCanvas} from '@napi-rs/canvas'
import {readIntakePdfEvidence} from '../../app/lib/documents/pdf-intake-evidence'
import {receiptBoundaries} from '../../app/lib/documents/receipt-boundaries'
import {classifyDocumentText} from '../../app/lib/documents/classification'
async function imagePdf(count=2){const pdf=await PDFDocument.create(),canvas=createCanvas(400,600);canvas.getContext('2d').fillRect(0,0,400,600);const image=await pdf.embedPng(canvas.toBuffer('image/png'));for(let i=0;i<count;i++)pdf.addPage([400,600]).drawImage(image,{x:0,y:0,width:400,height:600});return new Uint8Array(await pdf.save())}
describe('image-only PDF intake evidence',()=>{
 it('OCRs each photo page and preserves one logical customer-grouped bill',async()=>{
  const ocr=vi.fn().mockResolvedValueOnce({text:'VERIZON WIRELESS\nInvoice #VZ1041\nMay 8, 2026\nWireless service details'})
   .mockResolvedValueOnce({text:'VERIZON WIRELESS\nInvoice #VZ1041\nMay 8, 2026\nTotal $146.28'})
  const pages=await readIntakePdfEvidence(await imagePdf(),ocr)
  expect(ocr).toHaveBeenCalledTimes(2);expect(pages.map(p=>p.page)).toEqual([1,2])
  expect(classifyDocumentText(pages.map(p=>p.text).join('\n'))).toBe('receipt')
  expect(receiptBoundaries(pages,true)).toMatchObject({reason:null,receipts:[{regions:[{page:1},{page:2}]}]})
 })
 it('does not OCR a native text PDF or alter extracted text',async()=>{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage().drawText('VERIZON WIRELESS monthly service bill May 8, 2026 total $146.28',{font,size:10})
  const ocr=vi.fn();const pages=await readIntakePdfEvidence(new Uint8Array(await pdf.save()),ocr)
  expect(ocr).not.toHaveBeenCalled();expect(pages[0].text).toContain('$146.28')
 })
 it('keeps unreadable photo pages unknown instead of manufacturing a receipt',async()=>{
  const pages=await readIntakePdfEvidence(await imagePdf(1),async()=>({text:''}))
  expect(classifyDocumentText(pages[0].text)).toBe('unknown');expect(receiptBoundaries(pages,true).receipts).toEqual([])
 })
 it('bounds image-only classification OCR to ten pages',async()=>{
  const ocr=vi.fn().mockResolvedValue({text:''});await readIntakePdfEvidence(await imagePdf(11),ocr);expect(ocr).toHaveBeenCalledTimes(10)
 })
 it('maps OCR pixel boxes back to original PDF page coordinates for safe crops',async()=>{
  const pages=await readIntakePdfEvidence(await imagePdf(1),async()=>({text:'Bill',annotation:{pages:[{width:600,height:900,blocks:[{paragraphs:[{words:[{symbols:[{text:'Bill'}],boundingBox:{vertices:[{x:30,y:60},{x:90,y:60},{x:90,y:90},{x:30,y:90}]}}]}]}]}]}}))
  expect(pages[0]).toMatchObject({page:1,width:400,height:600,words:[{text:'Bill',x:20,y:40,width:40,height:20}]})
 })
})
