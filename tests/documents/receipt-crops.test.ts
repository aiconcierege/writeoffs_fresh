import {describe,it,expect} from 'vitest'
import {PDFDocument,StandardFonts} from 'pdf-lib'
import {createHash} from 'node:crypto'
import {readPdfPages} from '../../app/lib/documents/pdf-reader'
import {receiptBoundaries} from '../../app/lib/documents/receipt-boundaries'
import {receiptCrop} from '../../app/lib/documents/receipt-crops'
import {parseReceiptText} from '../../app/lib/documents/receipt-text'

describe('original-byte receipt crops',()=>{
 it('splits actual PDF marks, retains independent facts, and produces retry-stable hashes',async()=>{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([650,850])
  const lines=[['Desert Print Shop','Receipt # PRINT104','May 9, 2026','Business cards and promotional flyers','Total $218.40'],
   ['State Farm','Receipt # POLICY925','May 24, 2026','Commercial liability insurance','Total $118.75']]
  lines.forEach((receipt,index)=>receipt.forEach((text,line)=>page.drawText(text,{x:25+index*320,y:810-line*18,size:10,font})))
  const bytes=await pdf.save(),pages=await readPdfPages(bytes)
  const result=receiptBoundaries(pages.map(p=>({...p,text:p.plain})))
  expect(result.receipts).toHaveLength(2)
  const totals=[]
  for(const receipt of result.receipts){
   const first=await receiptCrop(bytes,'pdf',receipt),second=await receiptCrop(bytes,'pdf',receipt)
   expect(createHash('sha256').update(first.bytes).digest('hex')).toBe(createHash('sha256').update(second.bytes).digest('hex'))
   const cropped=await readPdfPages(first.bytes),text=cropped.map(p=>p.plain).join('\n')
   const facts=parseReceiptText(text)
   expect(facts.reason).toBeNull();totals.push(facts.totalAmountCents)
  }
  expect(totals).toEqual([21840,11875])
 })
})
