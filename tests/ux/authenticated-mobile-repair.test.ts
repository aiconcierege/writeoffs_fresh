import{readFileSync}from'node:fs'
import{describe,expect,it}from'vitest'
import{projectCustomerTransactionHistory}from'../../app/lib/bookkeeping/transaction-read-model'

const source=(path:string)=>readFileSync(path,'utf8')

describe('continuous check-in compatibility',()=>{
  it('redirects both legacy customer routes to the live continuous queue',()=>{
    expect(source('app/weekly-review/page.tsx')).toContain("redirect('/check-in')")
    expect(source('app/weekly-review/[id]/page.tsx')).toContain("redirect('/check-in')")
    expect(source('app/weekly-review/[id]/page.tsx')).not.toContain('preparing the exact weekly summary')
  })
  it('uses the current askable queue on Home',()=>{
    expect(source('app/home/page.tsx')).toContain('getCurrentAskableQuestionQueue')
    expect(source('app/lib/home/betti-home.ts')).toContain("href: '/check-in'")
    expect(source('app/lib/home/betti-home.ts')).not.toContain('finish last week')
    expect(source('app/lib/home/betti-home.ts')).not.toContain('I’ll ask one thing at a time.')
  })
})

describe('authenticated mobile contracts',()=>{
  it('reserves mobile space for Betti and keeps compact rows',()=>{
    const css=source('app/globals.css')
    expect(css).toContain('.question-context-line { display:grid')
    expect(css).toContain('.question-betti { position: static')
    expect(source('app/globals.css')).toContain('min-height:88px')
    expect(source('app/receipts/page_inner.tsx')).toContain('customerReceiptLabel')
  })
  it('uses plain vehicle and report language',()=>{
    const mileage=source('app/mileage/MileageClient.tsx')
    expect(mileage).toContain('How should I handle this vehicle')
    expect(mileage).toContain('Track my vehicle costs')
    expect(mileage).toContain('Tell me the business miles you drive. I’ll handle the deduction.')
    expect(mileage).toContain('I’ll track eligible costs and how much you use the vehicle for business.')
    expect(mileage).toContain("aria-pressed={selected==='standard_mileage'}")
    const report=source('app/reports/ReportsSummary.tsx')
    expect(report).toContain('Your business so far')
    expect(report).toContain('What still needs attention')
    expect(report).not.toContain('supported tax-treatment information')
  })
})

describe('customer transaction history projection',()=>{
  it('suppresses automation replays but always retains customer corrections',()=>{
    const history=projectCustomerTransactionHistory([
      {id:'1',created_at:'2026-09-01T00:00:00Z',bookkeeping_nature:'expense',treatment:'business',provenance:'automation',reason:'merchant'},
      {id:'2',created_at:'2026-09-01T00:00:01Z',bookkeeping_nature:'expense',treatment:'business',provenance:'automation',reason:'replay'},
      {id:'3',created_at:'2026-09-02T00:00:00Z',bookkeeping_nature:'expense',treatment:'personal',provenance:'user',reason:'correction'},
      {id:'4',created_at:'2026-09-03T00:00:00Z',bookkeeping_nature:'expense',treatment:'personal',provenance:'automation',reason:'reevaluation'},
    ])
    expect(history.map(item=>item.id)).toEqual(['1','3'])
    expect(history.find(item=>item.id==='3')?.summary).toBe('You marked this as personal.')
  })
})
