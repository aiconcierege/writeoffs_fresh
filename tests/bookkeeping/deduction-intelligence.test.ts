import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'
import { deductionSignal } from '../../app/lib/bookkeeping/deduction-intelligence'
import type { BookkeepingEvaluationSnapshot } from '../../app/lib/bookkeeping/deterministic-evaluator'

function snapshot(description:string,amountCents=-14000):BookkeepingEvaluationSnapshot{return{
 evaluatorVersion:'v1',businessId:'business',recordId:'record',sourceKind:'financial_transaction',
 amountCents,currency:'USD',occurredOn:'2026-08-20',merchantName:null,description,businessDescription:'Consulting',
 activeDocumentCount:0,customerAnswerCount:0,hasOpenConflictingEvidence:false,decisionHistoryLength:1,
 currentDecision:{id:'decision',businessId:'business',bookkeepingRecordId:'record',bookkeepingNature:'expense',
 treatment:'business',reviewStatus:'resolved',provenance:'user',actorUserId:'user',confidence:null,reason:null,
 businessPurpose:null,allocations:[{kind:'business',amountCents}],supersedesDecisionId:null,createdAt:'2026-08-20'},
 movement:null,movementCandidates:[]}}

describe('bounded deduction signals',()=>{
 it('detects only question-worthy phone, internet, and durable-equipment context',()=>{
  expect(deductionSignal(snapshot('Verizon Wireless monthly service'))).toMatchObject({kind:'phone',scope:'verizon'})
  expect(deductionSignal(snapshot('Cox internet service'))).toMatchObject({kind:'internet',scope:'cox'})
  expect(deductionSignal(snapshot('Commercial mower',-480000))).toMatchObject({kind:'equipment'})
  expect(deductionSignal(snapshot('Coffee shop'))).toBeNull()
  expect(deductionSignal(snapshot('Camera accessory',-5000))).toBeNull()
 })
 it('keeps factual copy and UI free of tax-method decisions',()=>{
  const question=readFileSync('app/questions/QuestionFlow.tsx','utf8')
  const page=readFileSync('app/deductions/DeductionProfile.tsx','utf8')
  expect(question).toContain('Business use percentage')
  expect(page).toContain('They do not guarantee a deduction')
  expect(`${question}${page}`).not.toMatch(/section 179|macrs|bonus depreciation|capitalization choice/i)
 })
 it('integrates discovery into the one current question queue',()=>{
  const questions=readFileSync('app/lib/bookkeeping/customer-questions.ts','utf8')
  expect(questions).toContain("from('current_deduction_attentions')")
  expect(questions).toContain('...deductionQuestions')
 })
})
