import { describe, expect, it, vi } from 'vitest'
import { answeredExpenseAllocations, finishAnsweredExpense } from '../../app/lib/bookkeeping/answered-expense-classification'
import type { BookkeepingEvaluationSnapshot } from '../../app/lib/bookkeeping/deterministic-evaluator'
function snapshot(): BookkeepingEvaluationSnapshot {
  return { evaluatorVersion: 'v1', businessId: 'business', recordId: 'record', sourceKind: 'financial_transaction',
    amountCents: -10000, currency: 'USD', occurredOn: '2025-04-02', merchantName: 'Adobe software subscription', description: 'Monthly software subscription',
    businessDescription: 'Design consulting', activeDocumentCount: 0, customerAnswerCount: 1, hasOpenConflictingEvidence: false,
    decisionHistoryLength: 2, movement: null, movementCandidates: [],
    currentDecision: { id: 'answer', businessId: 'business', bookkeepingRecordId: 'record', actorUserId: 'owner',
      supersedesDecisionId: 'prior', createdAt: '2026-09-14T00:00:00Z', bookkeepingNature: 'expense', treatment: 'mixed_use',
      reviewStatus: 'resolved', provenance: 'user', confidence: null, reason: 'Customer answer', businessPurpose: null,
      allocations: [{ kind: 'business', amountCents: -7500, taxCategoryKey: null }, { kind: 'personal', amountCents: -2500, taxCategoryKey: null }] } }
}
describe('bookkeeping completion within a customer answer', () => {
  it('fills a supported category while preserving exact customer amounts and purpose', () => {
    const source = snapshot(), original = structuredClone(source)
    const allocations = answeredExpenseAllocations(source)
    expect(allocations).toEqual([{ kind: 'business', amountCents: -7500, taxCategoryKey: 'software' },
      { kind: 'personal', amountCents: -2500, taxCategoryKey: null }])
    expect(source).toEqual(original)
  })
  it('never changes an existing category or a personal correction', () => {
    const source = snapshot(); source.currentDecision.allocations[0].taxCategoryKey = 'other'
    expect(answeredExpenseAllocations(source)).toBeNull()
    source.currentDecision.allocations[0].taxCategoryKey = null
    source.currentDecision.treatment = 'personal'
    expect(answeredExpenseAllocations(source)).toBeNull()
  })
  it('leaves assets and conflicting facts for their canonical review paths', () => {
    const source = snapshot(); source.hasOpenConflictingEvidence = true
    expect(answeredExpenseAllocations(source)).toBeNull()
    source.hasOpenConflictingEvidence = false
    source.merchantName = 'Laptop computer equipment'; source.description = 'Computer purchase'
    expect(answeredExpenseAllocations(source)).toBeNull()
  })
})


it.each(['personal','excluded','positive'])('does not load expense evidence for an already non-applicable committed answer: %s',async kind=>{
 const source=snapshot(),decision=source.currentDecision
 if(kind==='positive'){
  decision.bookkeepingNature='business_income';decision.treatment='business'
  decision.allocations=[{kind:'business',amountCents:210000,taxCategoryKey:null}]
 }else decision.treatment=kind as 'personal'|'excluded'
 const getUser=vi.fn(()=>{throw new Error('Unnecessary evidence lookup')})
 await finishAnsweredExpense({supabase:{auth:{getUser}} as never,result:{decision}})
 expect(getUser).not.toHaveBeenCalled()
})

it('does not load expense evidence or invent facts for explicit unknown-activity uncertainty',async()=>{
 const source=snapshot(),decision={...source.currentDecision,treatment:'unresolved',bookkeepingNature:null,allocations:[]},getUser=vi.fn(()=>{throw new Error('Unnecessary uncertainty evidence lookup')})
 const result={decision,answeredEvent:{answerPayload:{schemaVersion:1,response:'not_sure'}}},before=structuredClone(result)
 await finishAnsweredExpense({supabase:{auth:{getUser}} as never,result})
 expect(getUser).not.toHaveBeenCalled();expect(result).toEqual(before)
})
it.each(['factual-answer','supported-expense'])('preserves the evidence enrichment path for %s',async kind=>{
 const decision=kind==='supported-expense'?snapshot().currentDecision:{...snapshot().currentDecision,treatment:'unresolved',bookkeepingNature:null,allocations:[]}
 const getUser=vi.fn(()=>{throw new Error('Evidence path reached')})
 await expect(finishAnsweredExpense({supabase:{auth:{getUser}} as never,result:{decision,answeredEvent:{answerPayload:kind==='supported-expense'?{schemaVersion:1,response:'not_sure'}:{schemaVersion:1,businessPurpose:'client work'}}}})).rejects.toThrow('Evidence path reached')
 expect(getUser).toHaveBeenCalledOnce()
})
