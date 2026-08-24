import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDollarCents, validateManualMoney } from '../../app/lib/manual-money/validation'

const source=(file:string)=>readFileSync(resolve(process.cwd(),file),'utf8')
describe('manual financial activity product',()=>{
  it('parses exact positive dollars to integer cents',()=>{
    expect(parseDollarCents('600')).toBe(60000);expect(parseDollarCents('186.50')).toBe(18650)
    expect(parseDollarCents('1.234')).toBeNull();expect(parseDollarCents('-1')).toBeNull()
  })
  it('validates factual methods by direction and defaults canonical currency',()=>{
    const income=validateManualMoney({direction:'received',amount:'900',occurredOn:'2026-08-20',paymentMethod:'zelle_ach',counterpartyName:'Smith',description:'Landscaping'})
    expect(income).toMatchObject({ok:true,value:{amountCents:90000,currency:'USD',paymentMethod:'zelle_ach'}})
    expect(validateManualMoney({direction:'spent',amount:'700',occurredOn:'2026-08-20',paymentMethod:'personal_card_account'}).ok).toBe(true)
    expect(validateManualMoney({direction:'received',amount:'1',occurredOn:'2026-08-20',paymentMethod:'personal_card_account'}).ok).toBe(false)
  })
  it('uses plain-language mobile forms and protected workflow routing',()=>{
    const page=source('app/money/ManualMoneyClient.tsx');const policy=source('app/lib/route-policy.ts')
    expect(policy).toContain("'/money'");expect(page).toContain('Record money received');expect(page).toContain('Record money spent')
    expect(page).toContain('inputMode="decimal"');expect(page).toContain('Personal card/account')
    expect(page).not.toMatch(/journal entry|general ledger|debit|credit entry|chart of accounts/i)
  })
  it('integrates current reads and exports without a parallel reporting path',()=>{
    expect(source('app/lib/bookkeeping/transaction-read-model.ts')).toContain('current_manual_financial_activity')
    expect(source('app/lib/bookkeeping/financial-summary-repository.ts')).toContain('current_manual_financial_activity')
    expect(source('app/lib/bookkeeping/reporting-model.ts')).toContain('Recorded by customer')
    expect(source('app/api/export/csv/route.ts')).toContain('canonicalReportCsv')
  })
})
