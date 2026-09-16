import{describe,it,expect}from'vitest'
import{fileKind,assertStructuredText,containsDocumentBinaryText}from'../../app/lib/documents/file-validation'
import{parseStructuredFile}from'../../app/lib/documents/structured-text'
import{classifyDocumentText}from'../../app/lib/documents/classification'
import{statementPageText}from'../../app/lib/documents/pdf-layout'
import{parseStatementPages}from'../../app/lib/documents/statement-intelligence'
const bytes=(s:string)=>new TextEncoder().encode(s)
describe('content-first document intake',()=>{
 it('rejects PDF internals before structured parsing regardless of extension or MIME',()=>{
  for(const s of ['%PDF-1.4\nReportLab Generated PDF\n1,2,3','  %PDF-1.7\nDate,Description,Amount\n2026-05-01,Fake,12']){
   expect(fileKind(bytes(s))).toBe('pdf');expect(()=>parseStructuredFile(bytes(s))).toThrow('NOT_STRUCTURED_TEXT');expect(containsDocumentBinaryText({rows:[{description:s}]})).toBe(true)
  }
 })
 it('recognizes images by bytes and never parses them as rows',()=>{
  for(const [b,kind]of[[[137,80,78,71,13,10,26,10],'png'],[[255,216,255,0],'jpeg'],[Array.from(bytes('RIFF0000WEBP')),'webp']]as const){expect(fileKind(new Uint8Array(b))).toBe(kind);expect(()=>assertStructuredText(new Uint8Array(b))).toThrow()}
  expect(fileKind(new Uint8Array([0,1,255]))).toBe('unknown')
 })
 it('automatically reads valid structured activity and quoted descriptions',()=>{
  const r=parseStructuredFile(bytes('Date,Description,Amount\r\n2026-05-02,"Shop, West",-12.34\r\n2026-05-03,Customer,100.00'))
  expect(r.map(r=>r.amountCents)).toEqual([-1234,10000]);expect(r[0].rawDescription).toBe('Shop, West')
 })
 it('preserves explicit debit and credit columns',()=>{expect(parseStructuredFile(bytes('Date,Description,Debit,Credit\n05/02/2026,Transfer,12.00,\n05/03/2026,Payment,,50.00')).map(r=>r.amountCents)).toEqual([-1200,5000])})
 it.each(['Date,Description,Amount\n2026-05-01,"open,12','a,b,c\n1,2','Date,Description,Amount\nnot-a-date,Shop,12','Date,Description,Debit,Credit\n2026-05-01,Shop,12,5'])('fails closed on ambiguous/malformed rows',s=>expect(()=>parseStructuredFile(bytes(s))).toThrow())
 it('classifies receipt facts and financial headers, never a filename',()=>{
  expect(classifyDocumentText('Shop\n05/08/2026\nTOTAL $12.00')).toBe('receipt')
  expect(classifyDocumentText('Example Bank\nChecking statement\nStatement period: May 1, 2026 - May 31, 2026\nAccount activity\nPAYMENT BUSINESS CREDIT CARD')).toBe('bank_statement')
  expect(classifyDocumentText('Example Issuer\nCredit Card Statement\nPrevious balance $100.00\nMinimum payment due $10.00')).toBe('card_statement')
  expect(classifyDocumentText('Meeting notes for next Tuesday')).toBe('unknown')
 })
 it('reconstructs separate columns across pages and ignores balances and summaries',()=>{
  const item=(str:string,x:number,y:number,width=60)=>({str,transform:[1,0,0,1,x,y],width,height:10})
  const header=[item('Date',0,100),item('Description',70,100),item('Credits',250,100),item('Debits',350,100),item('Balance',450,100)]
  const first=statementPageText([...header,item('05/02',0,80),item('CLIENT PAYMENT',70,79.2),item('$100.00',250,80),item('$1100.00',450,80)])
  const second=statementPageText([...header,item('05/03',0,80),item('CARD PAYMENT',70,79.2),item('$25.00',350,80),item('$1075.00',450,80)])
  const [p]=parseStatementPages({documentClass:'bank_statement',documentSha256:'a'.repeat(64),pages:[{page:1,text:'Example Bank\nChecking Statement\nAccount ending 1234\nStatement Period: May 1, 2026 - May 31, 2026\nBeginning balance $1000.00\nEnding balance $1075.00\n'+first},{page:2,text:second+'\nPage 2\nDeposits and credits $100.00'}]})
  expect(p.accountType).toBe('checking');expect(p.maskedAccount).toBe('1234');expect(p.validationStatus).toBe('validated');expect(p.transactions.map(r=>[r.sourcePage,r.amountCents])).toEqual([[1,10000],[2,-2500]])
 })
})
