import {describe,it,expect} from 'vitest'
import {safeReturnTo,withReturnTo} from '../../app/lib/navigation-context'
import {parseLoanPaymentStatement} from '../../app/lib/documents/loan-statement'
import {buildCanonicalReport} from '../../app/lib/bookkeeping/reporting-model'
import type {CanonicalSummaryRecord} from '../../app/lib/bookkeeping/financial-summary'
import {purchaseReceiptEligible} from '../../app/lib/bookkeeping/receipt-eligibility'
import {refundMerchant} from '../../app/lib/bookkeeping/special-transactions'
function row(id:string,nature:string,treatment:string,amount:number,business:number,personal:number):CanonicalSummaryRecord{return {id,occurredOn:'2026-05-12',currency:'USD',amountCents:amount,financialSourceAssociationId:id,financialTransactionId:id,sourceKind:'financial_transaction',decisions:[{id,supersedesDecisionId:null,bookkeepingNature:nature as never,treatment:treatment as never,allocations:[...(business?[{id:id+'b',kind:'business' as const,amountCents:business,taxCategoryKey:'supplies'}]:[]),...(personal?[{id:id+'p',kind:'personal' as const,amountCents:personal}]:[])]}]}}
const report=(canonicalRecords:CanonicalSummaryRecord[])=>buildCanonicalReport({canonicalRecords,legacyRecords:[],currency:'USD',periodStart:'2026-01-01',periodEnd:'2026-12-31'})
describe('transaction workflow and independent personal use',()=>{
 it('preserves complete list context through nested question return',()=>{const origin='/transactions?view=review&q=store&start=2026-05-01&end=2026-05-31&category=supplies&account=abc&offset=50';const detail=withReturnTo('/transactions/11111111-1111-4111-8111-111111111111',origin);expect(safeReturnTo(detail)).toBe(detail);expect(new URL(detail,'https://local').searchParams.get('returnTo')).toBe(origin)})
 it.each(['https://evil.test','//evil.test','/\\evil.test','/api/documents','/transactions/../api/secrets','javascript:alert(1)','/transactions\n'])('rejects untrusted return %s',value=>expect(safeReturnTo(value)).toBe('/transactions'))
 it('keeps owner use out of profit and reconciles mixed cents',()=>{const r=report([row('p','expense','personal',-10000,0,-10000),row('m','expense','mixed_use',-20000,-13000,-7000)]);expect(r.ownerPersonalUseCents).toBe(17000);expect(r.businessExpensesCents).toBe(13000);expect(r.businessProfitCents).toBe(-13000);expect(r.rows).toHaveLength(2);expect(r.categoryTotals[0].amountCents).toBe(13000)})
 it.each([10000,3000])('reverses full/partial returns without revenue %i',refund=>{const r=report([row('p','expense','business',-10000,-10000,0),row('r','refund','business',refund,refund,0)]);expect(r.businessIncomeCents).toBe(0);expect(r.businessExpensesCents).toBe(10000-refund);expect(r.categoryTotals[0].amountCents).toBe(10000-refund)})
 it('respects separately established business and personal return amounts',()=>{const r=report([row('p','expense','mixed_use',-20000,-13000,-7000),row('r','refund','mixed_use',5000,3000,2000)]);expect(r.businessExpensesCents).toBe(10000);expect(r.ownerPersonalUseCents).toBe(5000)})
 it('does not assume an unresolved refund is revenue or reversal',()=>{const r=report([row('r','refund','unresolved',3210,0,0)]);expect(r.businessExpensesCents).toBe(0);expect(r.businessIncomeCents).toBe(0);expect(r.completeness.unresolvedRecordCount).toBe(1)})
 it.each(['credit_card_payment','loan_principal_payment','refund','transfer'])('never expects purchase receipts for %s',nature=>expect(purchaseReceiptEligible({amountCents:-10000,treatment:'unresolved',bookkeepingNature:nature})).toBe(false))
 it('uses loan documentation, not a purchase receipt, for loan components',()=>expect(purchaseReceiptEligible({amountCents:-4000,treatment:'business',bookkeepingNature:'expense',supportingDocumentOnly:true})).toBe(false))
 it('requires meaningful merchant equality beyond return prefixes',()=>expect(refundMerchant('REFUND - OFFICE DEPOT')).toBe(refundMerchant('OFFICE DEPOT #1142')))
})
describe('loan statement evidence',()=>{
 const text='Loan Statement\nPayment date: 2026-05-15\nTotal payment: $450.00\nPrincipal: $410.00\nInterest: $40.00\n'
 it('extracts explicit reconciled facts only',()=>expect(parseLoanPaymentStatement(text)).toEqual({paymentDate:'2026-05-15',paymentCents:45000,principalCents:41000,interestCents:4000}))
 it.each([text.replace('410.00','400.00'),text+'Principal: $400.00\n',text.replace('2026-05-15','2026-02-31'),text.replace('Interest: $40.00','Finance summary')])('holds inconsistent or missing evidence',input=>expect(parseLoanPaymentStatement(input)).toBeNull())
})
