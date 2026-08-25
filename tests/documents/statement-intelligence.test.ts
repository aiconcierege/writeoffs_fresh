import {describe,expect,it} from 'vitest'
import {normalizeStatementDescription,parseStatementPages,periodToRpc} from '../../app/lib/documents/statement-intelligence'

const hash='a'.repeat(64)
describe('statement intelligence',()=>{
  it('extracts and balance-validates exact-cent checking activity',()=>{
    const [period]=parseStatementPages({documentClass:'bank_statement',documentSha256:hash,pages:[{page:1,text:`Example Bank
Account ending in 1234
Statement Period: 01/01/2026 - 01/31/2026
Beginning balance $1,000.00
01/05/2026 PAYROLL DEPOSIT 100.00
01/07/2026 CHECK #104 MATERIALS 50.00
Ending balance $1,050.00`}]})
    expect(period).toMatchObject({institutionName:'Example Bank',maskedAccount:'1234',accountType:'checking',periodStart:'2026-01-01',
      periodEnd:'2026-01-31',validationStatus:'validated',beginningBalanceCents:100000,endingBalanceCents:105000})
    expect(period.transactions.map(row=>row.amountCents)).toEqual([10000,-5000])
    expect(period.transactions[1].checkNumber).toBe('104')
  })

  it('normalizes credit-card charges, payments, refunds, and year-boundary dates',()=>{
    const [period]=parseStatementPages({documentClass:'card_statement',documentSha256:hash,pages:[{page:1,text:`Example Card
Card ending in 7788
Statement Period: 12/15/2025 - 01/14/2026
12/20 COFFEE SHOP 8.75
01/02 PAYMENT THANK YOU 500.00
01/03 MERCHANT REFUND 12.00`}]})
    expect(period.transactions.map(row=>[row.transactionDate,row.amountCents])).toEqual([
      ['2025-12-20',-875],['2026-01-02',50000],['2026-01-03',1200]])
  })

  it('splits detectable periods and preserves more than 100 observations',()=>{
    const rows=Array.from({length:105},(_,index)=>`02/${String((index%20)+1).padStart(2,'0')}/2026 DEPOSIT BATCH ${index} +1.00`).join('\n')
    const periods=parseStatementPages({documentClass:'bank_statement',documentSha256:hash,pages:[
      {page:1,text:'First Bank\nAccount ending in 1234\nStatement Period: 01/01/2026 - 01/31/2026\n01/02/2026 DEPOSIT ONE +2.00'},
      {page:2,text:`First Bank\nAccount ending in 1234\nStatement Period: 02/01/2026 - 02/28/2026\n${rows}`},
    ]})
    expect(periods).toHaveLength(2);expect(periods[1].transactions).toHaveLength(105)
    expect(new Set(periods[1].transactions.map(row=>row.evidenceFingerprint)).size).toBe(105)
  })

  it('fails closed for ambiguous unsigned bank rows and does not retain full account numbers',()=>{
    const [period]=parseStatementPages({documentClass:'bank_statement',documentSha256:hash,pages:[{page:1,text:`Bank
Account 1234567890123456
Statement Period: 03/01/2026 - 03/31/2026
03/04/2026 SOMETHING 15.00`}]})
    expect(period.maskedAccount).toBeNull();expect(period.transactions).toEqual([]);expect(period.ambiguousRowCount).toBe(1)
    expect(period.validationStatus).toBe('unresolved')
  })

  it('keeps bounded normalized evidence and strict RPC fields',()=>{
    expect(normalizeStatementDescription('ACH MERCHANT TRACE #ABC123')).toBe('ACH MERCHANT')
    const [period]=parseStatementPages({documentClass:'bank_statement',documentSha256:hash,pages:[{page:30,text:`Bank
Statement Period: 04/01/2026 - 04/30/2026
04/02/2026 DEPOSIT CLIENT +25.00`}]})
    expect(periodToRpc(period).rows[0]).toMatchObject({amount_cents:2500,source_page:30})
  })
  it('fails closed when a scanned page has no native text',()=>{const [period]=parseStatementPages({documentClass:'bank_statement',
    documentSha256:hash,pages:[{page:1,text:''}]});expect(period.validationStatus).toBe('unresolved');expect(period.transactions).toEqual([])})
})
