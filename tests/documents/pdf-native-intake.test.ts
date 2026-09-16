import {describe,it,expect} from 'vitest'
import {PDFDocument,StandardFonts} from 'pdf-lib'
import {readPdfPages} from '../../app/lib/documents/pdf-reader'
import {parseStatementPages} from '../../app/lib/documents/statement-intelligence'
import {classifyDocumentText} from '../../app/lib/documents/classification'
describe('actual multi-page PDF intake',()=>{
 it('reads real PDF bytes with column direction, page boundaries, and repeated occurrences',async()=>{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica)
  for(let n=0;n<2;n++){
   const page=pdf.addPage([612,792]),put=(text:string,x:number,y:number)=>page.drawText(text,{x,y,size:10,font})
   put('Example Bank',40,750);put('Checking Statement',40,730);put('Account ending 1234',40,710)
   put('Statement period: May 1, 2026 - May 31, 2026',40,690)
   put('Date',40,650);put('Description',110,650);put('Credits',350,650);put('Debits',450,650)
   put('05/02',40,620);put('SAME PURCHASE',110,620);put('$12.00',450,620)
   put('Page '+(n+1),40,40)
  }
  const pages=await readPdfPages(await pdf.save())
  expect(pages).toHaveLength(2);expect(classifyDocumentText(pages.map(p=>p.plain).join('\n'))).toBe('bank_statement')
  const [period]=parseStatementPages({pages,documentClass:'bank_statement',documentSha256:'a'.repeat(64)})
  expect(period.transactions.map(t=>[t.sourcePage,t.amountCents])).toEqual([[1,-1200],[2,-1200]])
  expect(new Set(period.transactions.map(t=>t.evidenceFingerprint)).size).toBe(2)
 })
 it('rejects malformed PDF content without manufacturing rows',async()=>{
  await expect(readPdfPages(new TextEncoder().encode('%PDF-1.4\nnot a valid document'))).rejects.toThrow()
 })
})
