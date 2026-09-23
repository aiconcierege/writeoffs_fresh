import {describe,it,expect} from 'vitest'
import {receiptBoundaries,type ReceiptPage,type ReceiptWord} from '../../app/lib/documents/receipt-boundaries'
import {receiptTaxObservation} from '../../app/lib/documents/receipt-text'
function words(lines:string[],x=20,y=20):ReceiptWord[]{return lines.map((text,i)=>({text,x,y:y+i*14,width:190,height:10}))}
const printing=['Desert Print Shop','Receipt # PRINT104','May 9, 2026','Business cards and promotional flyers','Total $218.40']
const insurance=['State Farm','Receipt # POLICY925','May 12, 2026','Business liability insurance','Total $118.75']
function page(w:ReceiptWord[],n=1):ReceiptPage{return{page:n,width:650,height:850,words:w,text:w.map(i=>i.text).join('\n')}}
describe('evidence-backed logical receipt boundaries',()=>{
 it('preserves exact stated tax as supporting evidence without guessing or adding another expense',()=>{
  expect(receiptTaxObservation('Subtotal $200.00\nTax $18.40\nTotal $218.40')).toBe(1840)
  expect(receiptTaxObservation('Tax $0.001')).toBeNull()
  expect(receiptTaxObservation('Tax $1.00\nTax $2.00')).toBeNull()
  expect(receiptTaxObservation('Total $218.40')).toBeNull()
 })
 it.each(['vertical','horizontal'])('separates two receipts %s on one page',direction=>{
  const p=page([...words(printing),...words(insurance,direction==='horizontal'?350:20,direction==='vertical'?400:20)])
  const result=receiptBoundaries([p])
  expect(result.reason).toBeNull();expect(result.receipts).toHaveLength(2)
  expect(result.receipts[0].text).toContain('promotional flyers')
  expect(result.receipts[1].text).toContain('liability insurance')
  expect(result.receipts.every(r=>r.regions[0].page===1)).toBe(true)
 })
 it('keeps a two-page invoice with shared identity as one logical document',()=>{
  const p1=page(words(['Desert Print Shop','Invoice # PRINT104','May 9, 2026','Business cards','Page 1 of 2']))
  const p2=page(words(['Desert Print Shop','Invoice # PRINT104','Promotional flyers','Total $218.40','Page 2 of 2']),2)
  const r=receiptBoundaries([p1,p2]);expect(r.reason).toBeNull();expect(r.receipts).toHaveLength(1)
  expect(r.receipts[0].regions.map(p=>p.page)).toEqual([1,2])
 })
 it('does not split a repeated complete invoice header and total across pages',()=>{
  expect(receiptBoundaries([page(words(printing)),page(words(printing),2)]).receipts).toHaveLength(1)
 })
 it('keeps distinct complete documents on separate pages separate',()=>{
  expect(receiptBoundaries([page(words(printing)),page(words(insurance),2)]).receipts).toHaveLength(2)
 })
 it('never invents a second receipt from subtotal/tax/item columns',()=>{
  const r=receiptBoundaries([page([...words(printing),...words(['Subtotal $200.00','Tax $18.40'],350,25)])])
  expect(r.receipts).toHaveLength(1)
 })
 it('fails closed when two ambiguous pages have identical facts but no document identity',()=>{
  const w=words(printing.filter(s=>!s.startsWith('Receipt #')))
  expect(receiptBoundaries([page(w),page(w,2)]).reason).toBe('RECEIPT_BOUNDARIES_UNCLEAR')
 })
 it('does not guess totals or dates from incomplete evidence',()=>{
  expect(receiptBoundaries([page(words(['Shop','Something purchased']))]).reason).toBe('RECEIPT_BOUNDARIES_UNCLEAR')
 })
 it('separates three independently complete receipts on one page',()=>{
  const third=['Office Depot','Receipt # OFFICE105','May 13, 2026','Paper','Total $64.19']
  const r=receiptBoundaries([page([...words(printing),...words(insurance,20,300),...words(third,20,600)])])
  expect(r.reason).toBeNull();expect(r.receipts).toHaveLength(3)
 })
 it('does not absorb an unrelated incomplete page into a complete receipt',()=>{
  const r=receiptBoundaries([page(words(printing)),page(words(['Unrelated note','No transaction details']),2)])
  expect(r.reason).toBe('RECEIPT_BOUNDARIES_UNCLEAR')
 })
 it('does not merge unrelated merchants that happen to reuse an invoice number',()=>{
  const other=insurance.map(s=>s.replace('POLICY925','PRINT104'))
  expect(receiptBoundaries([page(words(printing)),page(words(other),2)]).receipts).toHaveLength(2)
 })
})
