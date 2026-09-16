import {describe,it,expect} from 'vitest'
import {catchUpQuote} from '../../app/lib/onboarding/catch-up'
import {historicalMileagePeriods} from '../../app/lib/mileage/historical'
import {mergeHistoricalMileage,type HistoricalMileageFact} from '../../app/lib/mileage/historical-repository'
import {assessVehicleDeduction} from '../../app/lib/mileage/vehicle-tax'
import {projectBettiHome} from '../../app/lib/home/betti-home'
import {selectCurrentAskableQuestions,type CustomerQuestion} from '../../app/lib/bookkeeping/customer-questions'
import {includeCanonicalVehicleExpenses} from '../../app/lib/bookkeeping/report-vehicle-expenses'
import {buildCanonicalReport} from '../../app/lib/bookkeeping/reporting-model'
import {validateOnboardingBusinessPatch} from '../../app/lib/onboarding/validation'

describe('launch catch-up pricing',()=>{
 it.each([['2026-09',0],['2026-08',0],['2026-07',1],['2026-01',7],['2025-12',8]])('%s has %i paid months',(start,months)=>{
  expect(catchUpQuote(start,'2026-09')).toMatchObject({additionalMonths:months,totalCents:months*2000,includedFrom:'2026-08'})
 })
 it('handles January and leap-year boundaries without day arithmetic',()=>{
  expect(catchUpQuote('2025-12','2026-01').totalCents).toBe(0)
  expect(catchUpQuote('2025-11','2026-01').totalCents).toBe(2000)
  expect(catchUpQuote('2024-01','2024-03').totalCents).toBe(2000)
 })
 it.each(['2026-10','2026-00','2026-13','2026-9','nonsense'])('rejects invalid/future month %s',month=>expect(()=>catchUpQuote(month,'2026-09')).toThrow())
})
describe('factual onboarding',()=>{
 it.each(['yes','no','not_sure'])('preserves product-fit answer %s',answer=>expect(validateOnboardingBusinessPatch({step:'eligibility',data:{schedule_c_eligibility:answer}})).toMatchObject({ok:true,update:{schedule_c_eligibility:answer}}))
 it('stores month precision and retains old materials history independently',()=>{
  expect(validateOnboardingBusinessPatch({step:'history',data:{business_stage:'new',business_start_month:'2022-03'}})).toEqual({ok:true,step:'history',update:{business_stage:'new',business_start_month:'2022-03-01'}})
 })
})
const base={method:'standard_mileage' as const,ownership:'owned' as const,totalMilesMilli:null,isMixedUse:false,expenses:[]}
const fact:HistoricalMileageFact={id:'h',tax_year:2026,vehicle_id:'v',answer:'entered',periods:[{from:'2026-01-01',through:'2026-06-30',milesMilli:1000000},{from:'2026-07-01',through:'2026-08-31',milesMilli:200000}]}
describe('historical mileage authority',()=>{
 it('asks for distinct periods when rates change',()=>expect(historicalMileagePeriods('2026-09')).toEqual([{from:'2026-01-01',through:'2026-06-30'},{from:'2026-07-01',through:'2026-08-31'}]))
 it('does not ask for a prior-year total in January',()=>expect(historicalMileagePeriods('2026-01')).toEqual([]))
 it('counts historical totals and new trips once, keeping underlying logs',()=>{
  const trips=[{vehicle_id:'v',occurred_on:'2026-02-01',miles_milli:20000},{vehicle_id:'v',occurred_on:'2026-09-01',miles_milli:10000}]
  const merged=mergeHistoricalMileage(trips,[fact],'2026-01-01','2026-12-31')
  expect(merged.milesMilli).toBe(1210000);expect(merged.trips).toHaveLength(1);expect(trips).toHaveLength(2)
  const report=assessVehicleDeduction({...base,historicalMiles:merged.summaries,businessMiles:merged.trips.map(t=>({occurredOn:t.occurred_on,milesMilli:t.miles_milli}))})
  expect(report.businessMilesMilli).toBe(1210000);expect(report.mileageDeductionCents).toBe(88460)
 })
 it('never applies standard mileage to actual-expense mode',()=>expect(assessVehicleDeduction({...base,method:'actual_expenses',historicalMiles:fact.periods!,businessMiles:[]}).mileageDeductionCents).toBe(0))
 it('does not convert deferred miles into a confirmed zero',()=>{
  const deferred=mergeHistoricalMileage([],[{...fact,answer:'deferred',periods:null}],'2026-01-01','2026-12-31')
  const zero=mergeHistoricalMileage([],[{...fact,answer:'zero',periods:null}],'2026-01-01','2026-12-31')
  expect(deferred.needsAttention).toBe(true);expect(zero.needsAttention).toBe(false)
 })
 it('accepts an explicit entered zero without inventing a vehicle',()=>expect(mergeHistoricalMileage([],[{...fact,vehicle_id:null,periods:fact.periods!.map(p=>({...p,milesMilli:0}))}],'2026-01-01','2026-12-31').needsAttention).toBe(false))
 it('uses annual business use for a shorter report period',()=>{
  const assessment=assessVehicleDeduction({...base,method:'actual_expenses',isMixedUse:true,totalMilesMilli:1000000,annualBusinessMilesMilli:600000,businessMiles:[{occurredOn:'2026-09-01',milesMilli:10000}],expenses:[{id:'fuel',kind:'fuel',amountCents:10000}]})
  expect(assessment.allocationBasisPoints).toBe(6000);expect(assessment.deductibleActualExpenseCents).toBe(6000)
 })
 it('requires vehicle facts rather than inventing a method or assigning miles',()=>expect(mergeHistoricalMileage([],[{...fact,vehicle_id:null}],'2026-01-01','2026-12-31')).toMatchObject({milesMilli:0,needsAttention:true}))
 it('flags logs exceeding a reported total and partial reporting periods',()=>{
  expect(mergeHistoricalMileage([{vehicle_id:'v',occurred_on:'2026-07-03',miles_milli:300000}],[fact],'2026-01-01','2026-12-31').needsAttention).toBe(true)
  expect(mergeHistoricalMileage([],[fact],'2026-03-01','2026-12-31').needsAttention).toBe(true)
 })
})
describe('calm truthful customer work',()=>{
 const home={name:null,greeting:'Good morning',receiptsProcessing:0,receiptsNeedHelp:0,outstandingDocumentation:0}
 it('uses small-queue language and keeps large counts out of the headline',()=>{
  expect(projectBettiHome({...home,askableQuestionCount:3}).supporting).toBe('I have 3 questions for you.')
  expect(projectBettiHome({...home,askableQuestionCount:88}).supporting).not.toContain('88')
  expect(projectBettiHome({...home,askableQuestionCount:0}).heading).toBe('Your books are current.')
 })
 const q=(id:string,date:string,kind:CustomerQuestion['kind']):CustomerQuestion=>({id,version:id,kind,recordId:id,prompt:'Question',transaction:{merchant:'Merchant',amountCents:-433,currency:'USD',date}})
 it('orders different kinds chronologically and retains all historical facts',()=>{
  const questions=[q('newmeal','2026-09-12','meal_relationship'),q('oldpurchase','2026-08-01','business_use'),q('newpurchase','2026-09-01','business_use')]
  const sorted=selectCurrentAskableQuestions({bookkeeping:questions,deduction:[],contractor:[],scope:'business',asOf:'2026-09-15'})
  expect(sorted.map(q=>q.id)).toEqual(['oldpurchase','newpurchase','newmeal'])
  expect(sorted).toHaveLength(3)
 })
})
describe('one canonical mileage expense',()=>{
 it('adds mileage to expense, profit and category totals together',()=>{
  const report=buildCanonicalReport({canonicalRecords:[],legacyRecords:[],periodStart:'2026-01-01',periodEnd:'2026-12-31',currency:'USD'})
  const result=includeCanonicalVehicleExpenses(report,[],10000)
  expect(result.businessExpensesCents).toBe(10000);expect(result.businessProfitCents).toBe(-10000)
  expect(result.categoryTotals.reduce((sum,r)=>sum+r.amountCents,0)).toBe(10000)
 })
})
