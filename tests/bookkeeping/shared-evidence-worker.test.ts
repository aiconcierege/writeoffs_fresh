import { beforeEach, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BookkeepingEvaluationSnapshot } from '../../app/lib/bookkeeping/deterministic-evaluator'
import { buildSharedEvidence } from '../../app/lib/bookkeeping/shared-evidence'
import { evaluateBookkeepingProcessingJob } from '../../app/lib/bookkeeping/processing'

const mocks = vi.hoisted(() => ({ load: vi.fn(), open: vi.fn(), apply: vi.fn() }))
vi.mock('../../app/lib/bookkeeping/evaluation-snapshot', () => ({ loadBookkeepingEvaluationSnapshot: mocks.load }))
vi.mock('../../app/lib/bookkeeping/supabase-repository', () => ({ SupabaseBookkeepingRepository: class { openReviewIssue = mocks.open } }))
vi.mock('../../app/lib/bookkeeping/agent-resolution', () => ({ applyAutomatedBookkeepingDecision: mocks.apply }))
vi.mock('../../app/lib/bookkeeping/deduction-intelligence', () => ({ runDeductionIntelligenceForRecord: async () => ({ outcome: 'not_applicable' }) }))
vi.mock('../../app/lib/bookkeeping/vehicle-processing', () => ({ processVehicleExpense: async () => ({ outcome: 'not_applicable' }) }))
vi.mock('../../app/lib/bookkeeping/tax-treatment-service', () => ({ evaluateAndAppendProductionTaxTreatment: () => { throw Error('Must not invent tax support') } }))
beforeEach(() => vi.clearAllMocks())

it('real worker consumes OCR, supersedes generic questions, asks only meal facts, and remains stable after answers', async () => {
  const s: BookkeepingEvaluationSnapshot = { evaluatorVersion: 'v1', businessId: 'tenant', recordId: 'receipt-only',
    sourceKind: 'receipt', amountCents: -954, currency: 'USD', occurredOn: '2026-09-08', merchantName: null,
    description: null, businessDescription: null, activeDocumentCount: 1, customerAnswerCount: 1,
    hasOpenConflictingEvidence: false, decisionHistoryLength: 2, movement: null, movementCandidates: [],
    currentDecision: { id: 'decision', businessId: 'tenant', bookkeepingRecordId: 'receipt-only', actorUserId: 'owner',
      supersedesDecisionId: null, createdAt: '2026-09-17T00:00:00Z', bookkeepingNature: 'expense',
      treatment: 'business', reviewStatus: 'needs_review', provenance: 'user', confidence: null, reason: null,
      businessPurpose: 'food', allocations: [{ kind: 'business', amountCents: -954 }] } }
  s.evidence = buildSharedEvidence(s, [{ source: { kind: 'receipt_extraction', id: 'ocr', basis: 'observed', provider: 'google_vision', confidence: null },
    receiptId: 'receipt', linkId: 'link', quality: 'usable', merchant: 'Independent Restaurant', date: '2026-09-08',
    totalCents: 954, content: ['Sausage sandwich', 'Hash Brown', 'Coffee'], matchState: 'receipt_only' }],
  [{ source: { kind: 'customer_answer', id: 'answer', basis: 'customer_supplied', provider: null, confidence: null },
    fact: 'ordinary_expense_purpose', value: { businessPurpose: 'food' } }])
  mocks.load.mockImplementation(async () => s)
  mocks.apply.mockImplementation(async ({ proposal }) => { s.currentDecision = { ...s.currentDecision, ...proposal, id: 'enriched' }; return s.currentDecision })
  let mealFact = false, resolved = false
  const rpc = vi.fn(async (name: string) => {
    if (name === 'read_authorized_bookkeeping_scope') return {data:{businessId:'tenant',authorizedStart:'2026-01-01'},error:null}
    if (name === 'resolve_bookkeeping_review_issue') resolved = true
    return { data: name === 'record_bookkeeping_business_context_assessment' ? 'assessment' : true, error: null }
  })
  const db = { rpc, from(table: string) {
    let successorQuery = false
    const result = () => ({ data: table === 'bookkeeping_review_events' ? successorQuery ? [] : resolved ? [] : [{ id: 'generic', review_issue_id: 'old', question_context: { factType: 'ordinary_expense_purpose' } }]
      : table === 'current_bookkeeping_meal_substantiation_facts' ? mealFact ? { id: 'meal-fact' } : null : [], error: null })
    const q = { select: () => q, eq: () => q, in: (field: string) => { if (field === 'supersedes_event_id') successorQuery = true; return q },
      maybeSingle: async () => ({ data: table === 'bookkeeping_records'?{occurred_on:'2026-09-08'}:table === 'current_bookkeeping_meal_substantiation_facts' ? mealFact ? { id: 'meal-fact' } : null : null, error: null }),
      insert: async () => ({ error: null }), then: (resolve: (x: unknown) => unknown) => Promise.resolve(result()).then(resolve) }
    return q
  } } as unknown as SupabaseClient
  const job = { business_id: 'tenant', bookkeeping_record_id: 'receipt-only', processing_reason: 'deterministic_evaluation', target_fingerprint: 'bookkeeping-evaluator:v2:record:receipt-only' }
  for (let i = 0; i < 3; i++) await evaluateBookkeepingProcessingJob(db, job, { allowAiShadow: false })
  expect(mocks.apply).toHaveBeenCalledTimes(1)
  expect(s.currentDecision.allocations).toEqual([{ kind: 'business', amountCents: -954, taxCategoryKey: 'meals', memo: null }])
  expect(rpc).toHaveBeenCalledWith('resolve_bookkeeping_review_issue', expect.objectContaining({ p_review_issue_id: 'old' }))
  expect(new Set(mocks.open.mock.calls.map(([arg]) => arg.issueKey)).size).toBe(1)
  expect(mocks.open.mock.calls.every(([arg]) => arg.questionContext.factType === 'meal_attendee_relationship')).toBe(true)
  mealFact = true
  mocks.open.mockClear()
  await evaluateBookkeepingProcessingJob(db, job, { allowAiShadow: false })
  expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({ questionContext: expect.objectContaining({ factType: 'receipt_meal_business_purpose' }) }))
  s.currentDecision.businessPurpose = 'Discussed project milestones with client'
  mocks.open.mockClear()
  for (let i = 0; i < 3; i++) await evaluateBookkeepingProcessingJob(db, job, { allowAiShadow: false })
  expect(mocks.open).not.toHaveBeenCalled()
})

it('versioned economic-evidence upgrade jobs reach the same scope-checked snapshot loader',async()=>{
 mocks.load.mockRejectedValue(new Error('SNAPSHOT_PROBE'))
 const db={rpc:async()=>({data:{businessId:'tenant',authorizedStart:'2026-01-01'},error:null}),from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{occurred_on:'2026-05-19'},error:null})})})})})} as unknown as SupabaseClient
 const job={business_id:'tenant',bookkeeping_record_id:'record',processing_reason:'source_economic_evidence_v1',target_fingerprint:'source-economic:v1:record:record:decision:decision'}
 await expect(evaluateBookkeepingProcessingJob(db,job,{allowAiShadow:false})).rejects.toThrow('SNAPSHOT_PROBE')
 expect(mocks.load).toHaveBeenCalledWith({admin:db,businessId:'tenant',recordId:'record'})
 mocks.load.mockClear()
 await expect(evaluateBookkeepingProcessingJob(db,{...job,target_fingerprint:'unrecognized'})).resolves.toEqual({outcome:'legacy_noop'})
 expect(mocks.load).not.toHaveBeenCalled()
})
