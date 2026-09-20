import {describe,it,expect} from 'vitest'
import {buildCanonicalReport} from '../../app/lib/bookkeeping/reporting-model'
import type {CanonicalSummaryRecord,CanonicalSummaryDecision} from '../../app/lib/bookkeeping/financial-summary'

type Nature = CanonicalSummaryDecision['bookkeepingNature']
let sequence=0
function entry(amount:number,nature:Nature='expense',category:string|null='supplies',date='2026-05-15',personal=0):CanonicalSummaryRecord {
 const id=`flagship-${++sequence}`
 return {id,occurredOn:date,amountCents:amount,currency:'USD',sourceKind:'financial_transaction',financialSourceAssociationId:id,financialTransactionId:id,merchant:'Synthetic vendor',description:'Controlled canonical report fixture',hasEvidence:false,
  decisions:[{id:`decision-${id}`,supersedesDecisionId:null,bookkeepingNature:nature,treatment:nature===null?'unresolved':['transfer','credit_card_payment','owner_contribution'].includes(nature)?'excluded':personal===Math.abs(amount)?'personal':personal?'mixed_use':'business',allocations:nature===null?[]:[...(Math.abs(amount)!==personal?[{id:`business-${id}`,kind:['transfer','credit_card_payment','owner_contribution'].includes(nature??'')?'excluded' as const:'business' as const,amountCents:amount+personal,taxCategoryKey:category}]:[]),...(personal?[{id:`personal-${id}`,kind:'personal' as const,amountCents:-personal}]:[])]}]}
}
function fixture(){return [entry(100000,'business_income'),entry(50000,'business_income',null,'2026-09-10'),
 ...['advertising','supplies','insurance','utilities','contract_labor','office_expense'].map(category=>entry(-1000,'expense',category)),
 entry(200,'refund','supplies'),entry(-1000,'expense','utilities','2026-05-15',300),entry(-900,'expense',null,'2026-05-15',900),
 entry(-5000,'transfer'),entry(-5000,'credit_card_payment'),entry(5000,'owner_contribution'),entry(-954,'expense','meals'),entry(-500,null)]}
function report(start:string,end:string){return buildCanonicalReport({canonicalRecords:fixture(),legacyRecords:[],periodStart:start,periodEnd:end,currency:'USD'})}

describe('flagship report representative canonical fixtures',()=>{
 it('reconciles many categories, a refund, mixed use, meals and missing receipts without counting personal or funding activity',()=>{
  const r=report('2026-01-01','2026-12-31')
  expect(r.businessIncomeCents).toBe(150000)
  expect(r.businessExpensesCents).toBe(6000-200+700+954)
  expect(r.businessProfitCents).toBe(150000-7454)
  expect(r.categoryTotals.reduce((sum,row)=>sum+row.amountCents,0)+r.uncategorizedBusinessExpensesCents).toBe(r.businessExpensesCents)
  expect(r.completeness.unresolvedRecordCount).toBe(1)
  expect(r.completeness.unresolvedTaxTreatmentCount).toBeGreaterThan(0)
  expect(r.estimatedDeductionsCents).toBeNull()
 })
 it('keeps current-only and catch-up plus current views on the same arithmetic',()=>{
  const current=report('2026-08-01','2026-09-20'),combined=report('2026-01-01','2026-09-20')
  expect(current.businessIncomeCents).toBe(50000)
  expect(current.businessExpensesCents).toBe(0)
  expect(combined.businessIncomeCents).toBe(150000)
  expect(combined.businessExpensesCents).toBe(7454)
 })
})
