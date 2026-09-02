import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { CanonicalBookkeepingService } from '../../app/lib/bookkeeping/service'
import { CanonicalDocumentationService } from '../../app/lib/bookkeeping/documentation-events'
import { CanonicalWeeklyReviewService } from '../../app/lib/bookkeeping/review-events'
import { resolveFinancialTransactionRecord } from '../../app/lib/bookkeeping/financial-transaction-workflow'
import { SupabaseBookkeepingRepository } from '../../app/lib/bookkeeping/supabase-repository'
import { correctCanonicalTransactionUse } from '../../app/lib/bookkeeping/transaction-corrections'
import { listCanonicalReviewQueue } from '../../app/lib/bookkeeping/review-queue'
import { actOnCustomerQuestion } from '../../app/lib/bookkeeping/customer-question-actions'
import { listCustomerQuestions } from '../../app/lib/bookkeeping/customer-questions'
import { prepareWeeklyReviews } from '../../app/lib/bookkeeping/weekly-review-processing'
import { getCurrentCustomerWeeklyReview } from '../../app/lib/bookkeeping/weekly-review'
import { getAuthenticatedCanonicalReport } from '../../app/lib/bookkeeping/reporting-service'
import { listTransactionReadModel } from '../../app/lib/bookkeeping/transaction-read-model'
import { reviewTreatmentLabel } from '../../app/lib/bookkeeping/weekly-review-presentation'
import type { StoredReviewAnswerResult } from '../../app/lib/bookkeeping/review-answer-model'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const runLocal = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const client = (key: string) => createClient(url!, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function establishExpense(owner: Awaited<ReturnType<typeof provisionLocalCanonicalOwner>>, index: number) {
  const financialTransactionId = owner.transactionIds[index]
  const resolved = await resolveFinancialTransactionRecord({ supabase: owner.customer, financialTransactionId })
  const amount = resolved.record.authoritativeAmountCents
  if (amount == null) throw new Error('Expected an authoritative transaction amount.')
  const service = new CanonicalBookkeepingService(new SupabaseBookkeepingRepository(owner.customer))
  const decision = await service.recordDecision({ actor: { businessId: owner.businessId,
    userId: owner.userId, provenance: 'user' }, recordId: resolved.record.id,
  expectedCurrentDecisionId: resolved.decision.id, decision: { bookkeepingNature: 'expense',
    treatment: 'business', reviewStatus: 'resolved', reason: 'Local established expense.',
    allocations: [{ kind: 'business', amountCents: amount, taxCategoryKey: null }] } })
  return { financialTransactionId, recordId: resolved.record.id, decision }
}

async function createPeriod(admin: SupabaseClient, owner: Awaited<ReturnType<typeof provisionLocalCanonicalOwner>>) {
  const cadence = await admin.from('business_review_cadence_events').insert({ business_id: owner.businessId,
    check_in_weekday: 6, timezone_name: 'America/Phoenix', effective_from: '2026-08-01',
    provenance: 'system' }).select('id').single()
  if (cadence.error) throw cadence.error
  const period = await admin.from('bookkeeping_review_periods').insert({ business_id: owner.businessId,
    period_start: '2026-08-01', period_end: '2026-08-07', check_in_date: '2026-08-08',
    cadence_event_id: cadence.data.id, membership_scope: 'business' }).select('id').single()
  if (period.error) throw period.error
  // This helper intentionally represents an already-underway v2 workflow. New
  // untouched reviews are v3, while persisted v2 histories retain their order.
  const event=await admin.from('bookkeeping_weekly_review_workflow_events').insert({
    business_id:owner.businessId,review_period_id:period.data.id,stage:'personal',event_type:'stage_completed',
    details:{flowVersion:2},actor_user_id:owner.userId,request_id:crypto.randomUUID(),
  }).select('id').single()
  if(event.error)throw event.error
  return { id: period.data.id as string, eventId: event.data.id as string }
}

async function createUntouchedV3Period(admin:SupabaseClient,owner:Awaited<ReturnType<typeof provisionLocalCanonicalOwner>>){
 const cadence=await admin.from('business_review_cadence_events').insert({business_id:owner.businessId,
  check_in_weekday:6,timezone_name:'America/Phoenix',effective_from:'2026-08-01',provenance:'system'}).select('id').single()
 if(cadence.error)throw cadence.error
 const period=await admin.from('bookkeeping_review_periods').insert({business_id:owner.businessId,
  period_start:'2026-08-01',period_end:'2026-08-07',check_in_date:'2026-08-08',cadence_event_id:cadence.data.id,
  membership_scope:'business'}).select('id').single()
 if(period.error)throw period.error
 return period.data.id as string
}

async function openMissing(admin: SupabaseClient, businessId: string, recordId: string) {
  return new CanonicalDocumentationService(new SupabaseBookkeepingRepository(admin)).openRequest({
    businessId, recordId, reason: 'MISSING_SUPPORTING_DOCUMENTATION',
    issueKey: `missing:${recordId}`, contextFingerprint: `missing:${recordId}:v1`,
    questionContext: { schemaVersion: 1, reason: 'MISSING_SUPPORTING_DOCUMENTATION' },
  })
}

describe.skipIf(!runLocal)('weekly review canonical exception decisions on local Supabase', () => {
  it('opens mixed clarification for an unresolved negative leaf without allocating prematurely',async()=>{
    const admin=client(serviceKey!),owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,
      label:'weekly-v3-unresolved-mixed',amounts:[-14_235,-9_680]})
    const unresolved=await resolveFinancialTransactionRecord({supabase:owner.customer,
      financialTransactionId:owner.transactionIds[0]})
    const blocked=await resolveFinancialTransactionRecord({supabase:owner.customer,
      financialTransactionId:owner.transactionIds[1]})
    const blockingIssue=await new CanonicalWeeklyReviewService(new SupabaseBookkeepingRepository(admin)).openIssue({
      businessId:owner.businessId,recordId:blocked.record.id,decisionId:blocked.decision.id,
      reason:'TRANSACTION_TYPE_UNCLEAR',issueKey:`type:${blocked.record.id}`,
      contextFingerprint:`type:${blocked.record.id}:v1`,questionContext:{schemaVersion:1,reason:'TRANSACTION_TYPE_UNCLEAR'},
    })
    expect(blockingIssue.reason).toBe('TRANSACTION_TYPE_UNCLEAR')
    const periodId=await createUntouchedV3Period(admin,owner)
    const personal=await owner.customer.rpc('complete_weekly_personal_sweep',{p_review_period_id:periodId,
      p_expected_workflow_event_id:null,p_request_id:crypto.randomUUID(),p_items:[]})
    expect(personal.error).toBeNull()
    const blockedOpen=await owner.customer.rpc('open_weekly_mixed_clarifications',{p_review_period_id:periodId,
      p_expected_workflow_event_id:personal.data.workflow_event_id,p_request_id:crypto.randomUUID(),p_items:[{
        recordId:blocked.record.id,transactionId:owner.transactionIds[1],decisionId:blocked.decision.id}]})
    expect(blockedOpen.error?.message).toContain('Another material fact must be resolved first')
    const before=await owner.customer.from('bookkeeping_decisions').select('id',{count:'exact',head:true})
      .eq('bookkeeping_record_id',unresolved.record.id)
    const opened=await owner.customer.rpc('open_weekly_mixed_clarifications',{p_review_period_id:periodId,
      p_expected_workflow_event_id:personal.data.workflow_event_id,p_request_id:crypto.randomUUID(),p_items:[{
        recordId:unresolved.record.id,transactionId:owner.transactionIds[0],decisionId:unresolved.decision.id}]})
    expect(opened.error).toBeNull()
    expect(opened.data).toMatchObject({opened_count:1,idempotent:false})
    const after=await owner.customer.from('bookkeeping_decisions').select('id',{count:'exact',head:true})
      .eq('bookkeeping_record_id',unresolved.record.id)
    expect(after.count).toBe(before.count)
    const question=(await listCustomerQuestions({supabase:owner.customer})).find(item=>item.recordId===unresolved.record.id)
    expect(question).toMatchObject({kind:'mixed_use',materiality:'totals'})
    const answered=await actOnCustomerQuestion({supabase:owner.customer,issueId:question!.id,
      expectedEventId:question!.version,command:{action:'mixed_business_percentage',businessPercentage:'40'}})as StoredReviewAnswerResult
    expect(answered.decision).toMatchObject({bookkeepingNature:null,treatment:'unresolved',reviewStatus:'needs_review'})
    expect(answered.decision.allocations).toEqual([])
    expect((await listCustomerQuestions({supabase:owner.customer})).find(item=>item.recordId===unresolved.record.id))
      .toMatchObject({kind:'transaction_type',materiality:'totals'})
  })
  it('persists v3 mixed identification and database-authoritative percentage allocation',async()=>{
    const admin=client(serviceKey!),owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,
      label:'weekly-v3-percentage',amounts:[-14_235]})
    const expense=await establishExpense(owner,0),periodId=await createUntouchedV3Period(admin,owner)
    const foreign=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'weekly-v3-foreign',amounts:[-9_999]})
    const foreignExpense=await establishExpense(foreign,0)
    const personal=await owner.customer.rpc('complete_weekly_personal_sweep',{p_review_period_id:periodId,
      p_expected_workflow_event_id:null,p_request_id:crypto.randomUUID(),p_items:[]})
    expect(personal.error).toBeNull()
    expect((await client(anonKey!).rpc('open_weekly_mixed_clarifications',{p_review_period_id:periodId,
      p_expected_workflow_event_id:personal.data.workflow_event_id,p_request_id:crypto.randomUUID(),p_items:[]})).error)
      .not.toBeNull()
    const denied=await owner.customer.rpc('open_weekly_mixed_clarifications',{p_review_period_id:periodId,
      p_expected_workflow_event_id:personal.data.workflow_event_id,p_request_id:crypto.randomUUID(),p_items:[{
        recordId:foreignExpense.recordId,transactionId:foreignExpense.financialTransactionId,decisionId:foreignExpense.decision.id}]})
    expect(denied.error).not.toBeNull()
    const openRequestId=crypto.randomUUID(),openInput={p_review_period_id:periodId,
      p_expected_workflow_event_id:personal.data.workflow_event_id,p_request_id:openRequestId,p_items:[{
        recordId:expense.recordId,transactionId:expense.financialTransactionId,decisionId:expense.decision.id}]}
    const opened=await owner.customer.rpc('open_weekly_mixed_clarifications',openInput)
    expect(opened.error).toBeNull()
    expect(opened.data).toMatchObject({opened_count:1,idempotent:false})
    expect((await owner.customer.rpc('open_weekly_mixed_clarifications',openInput)).data)
      .toMatchObject({workflow_event_id:opened.data.workflow_event_id,idempotent:true})
    expect((await owner.customer.rpc('open_weekly_mixed_clarifications',{...openInput,p_request_id:crypto.randomUUID()})).error)
      .not.toBeNull()
    const question=(await listCustomerQuestions({supabase:owner.customer})).find(item=>item.recordId===expense.recordId)
    expect(question).toMatchObject({kind:'mixed_use',materiality:'totals'})
    const answered=await actOnCustomerQuestion({supabase:owner.customer,issueId:question!.id,
      expectedEventId:question!.version,command:{action:'mixed_business_percentage',businessPercentage:'40'}})as StoredReviewAnswerResult
    expect(answered.decision.treatment).toBe('mixed_use')
    expect(answered.decision.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({kind:'business',amountCents:-5_694}),
      expect.objectContaining({kind:'personal',amountCents:-8_541}),
    ]))
    expect(answered.decision.allocations.reduce((sum,item)=>sum+item.amountCents,0)).toBe(-14_235)
    const provenance=await owner.customer.from('bookkeeping_mixed_use_answer_provenance')
      .select('business_basis_points,business_amount_cents,personal_amount_cents').eq('review_issue_id',question!.id).single()
    expect(provenance.data).toEqual({business_basis_points:4000,business_amount_cents:-5694,personal_amount_cents:-8541})
    expect((await listCustomerQuestions({supabase:owner.customer})).find(item=>item.id===question!.id)).toBeUndefined()
  })
  it('canonicalizes zero and one hundred percent boundaries without a fake mixed split',async()=>{
    const admin=client(serviceKey!),owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,
      label:'weekly-v3-boundaries',amounts:[-1_001,-1_001,-101]})
    const expenses=[await establishExpense(owner,0),await establishExpense(owner,1),await establishExpense(owner,2)]
    const periodId=await createUntouchedV3Period(admin,owner)
    const personal=await owner.customer.rpc('complete_weekly_personal_sweep',{p_review_period_id:periodId,
      p_expected_workflow_event_id:null,p_request_id:crypto.randomUUID(),p_items:[]})
    const opened=await owner.customer.rpc('open_weekly_mixed_clarifications',{p_review_period_id:periodId,
      p_expected_workflow_event_id:personal.data.workflow_event_id,p_request_id:crypto.randomUUID(),p_items:expenses.map(item=>({
        recordId:item.recordId,transactionId:item.financialTransactionId,decisionId:item.decision.id}))})
    expect(opened.error).toBeNull()
    const questions=(await listCustomerQuestions({supabase:owner.customer})).filter(item=>item.kind==='mixed_use')
    for(const [index,percentage] of ['0','100','50.00'].entries())await actOnCustomerQuestion({supabase:owner.customer,
      issueId:questions.find(item=>item.recordId===expenses[index].recordId)!.id,
      expectedEventId:questions.find(item=>item.recordId===expenses[index].recordId)!.version,
      command:{action:'mixed_business_percentage',businessPercentage:percentage}})
    const rows=await owner.customer.from('bookkeeping_decisions').select('bookkeeping_record_id,treatment')
      .in('bookkeeping_record_id',expenses.map(item=>item.recordId))
    const leaves=(rows.data??[]).filter(row=>['personal','business','mixed_use'].includes(row.treatment))
    expect(leaves).toEqual(expect.arrayContaining([
      expect.objectContaining({bookkeeping_record_id:expenses[0].recordId,treatment:'personal'}),
      expect.objectContaining({bookkeeping_record_id:expenses[1].recordId,treatment:'business'}),
      expect.objectContaining({bookkeeping_record_id:expenses[2].recordId,treatment:'mixed_use'}),
    ]))
    const allocations=await owner.customer.from('bookkeeping_allocations').select('allocation_kind,amount_cents')
      .eq('bookkeeping_record_id',expenses[2].recordId)
    expect(allocations.data).toEqual(expect.arrayContaining([
      expect.objectContaining({allocation_kind:'business',amount_cents:-51}),
      expect.objectContaining({allocation_kind:'personal',amount_cents:-50}),
    ]))
  })
  it('carries business-dollar mixed use through the complete version-2 review and reporting lifecycle', async () => {
    const admin = client(serviceKey!)
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'weekly-guided-mixed', amounts: [-18_600, -10_000, -5_000] })
    const questioned = await establishExpense(owner, 0)
    const existing = await establishExpense(owner, 1)
    const limited = await establishExpense(owner, 2)
    const service = new CanonicalBookkeepingService(new SupabaseBookkeepingRepository(owner.customer))
    const existingMixed = await service.recordDecision({ actor: { businessId: owner.businessId,
      userId: owner.userId, provenance: 'user' }, recordId: existing.recordId,
    expectedCurrentDecisionId: existing.decision.id, decision: { bookkeepingNature: 'expense',
      treatment: 'mixed_use', reviewStatus: 'resolved', reason: 'Existing mixed-use fact.',
      allocations: [{ kind: 'business', amountCents: -7_000, taxCategoryKey: null },
        { kind: 'personal', amountCents: -3_000, taxCategoryKey: null }] } })
    const mixedIssue = await new CanonicalWeeklyReviewService(new SupabaseBookkeepingRepository(admin)).openIssue({
      businessId: owner.businessId, recordId: questioned.recordId, decisionId: questioned.decision.id,
      reason: 'MIXED_USE_CLARIFICATION', issueKey: `mixed-use:${questioned.recordId}`,
      contextFingerprint: `mixed-use:${questioned.recordId}:v1`, questionContext: {
        schemaVersion: 1, reason: 'MIXED_USE_CLARIFICATION', businessUse: 'mixed',
        authoritativeAmountCents: -18_600, authoritativeCurrency: 'USD',
      },
    })
    const unresolvedIssue = await new CanonicalWeeklyReviewService(new SupabaseBookkeepingRepository(admin)).openIssue({
      businessId: owner.businessId, recordId: limited.recordId, decisionId: limited.decision.id,
      reason: 'BUSINESS_PURPOSE_NEEDED', issueKey: `purpose:${limited.recordId}`,
      contextFingerprint: `purpose:${limited.recordId}:v1`, questionContext: {
        schemaVersion: 1, reason: 'BUSINESS_PURPOSE_NEEDED',
      },
    })
    const period = await createPeriod(admin, owner)
    await Promise.all([
      openMissing(admin, owner.businessId, questioned.recordId),
      openMissing(admin, owner.businessId, existing.recordId),
      openMissing(admin, owner.businessId, limited.recordId),
    ])
    const documentation = await owner.customer.rpc('complete_weekly_missing_documentation_decision', {
      p_review_period_id: period.id, p_expected_workflow_event_id: period.eventId,
      p_request_id: crypto.randomUUID(), p_decision: 'include_missing',
      p_record_ids: [questioned.recordId, existing.recordId, limited.recordId], p_complete_stage: true,
    })
    expect(documentation.error).toBeNull()

    const before = await listCustomerQuestions({ supabase: owner.customer })
    expect(before).toContainEqual(expect.objectContaining({ id: mixedIssue.reviewIssueId,
      kind: 'mixed_use', transaction: expect.objectContaining({ amountCents: -18_600 }) }))
    const answer = await actOnCustomerQuestion({ supabase: owner.customer,
      issueId: mixedIssue.reviewIssueId, expectedEventId: mixedIssue.id,
      command: { action: 'mixed_business_amount', businessAmountCents: 12_000 } }) as StoredReviewAnswerResult
    expect(answer.decision).toMatchObject({ treatment: 'mixed_use', provenance: 'user',
      supersedesDecisionId: questioned.decision.id })
    expect(answer.decision.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'business', amountCents: -12_000 }),
      expect.objectContaining({ kind: 'personal', amountCents: -6_600 }),
    ]))
    expect(answer.decision.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0))
      .toBe(-18_600)
    expect((await listCustomerQuestions({ supabase: owner.customer }))
      .find(question => question.id === mixedIssue.reviewIssueId)).toBeUndefined()
    expect((await listCustomerQuestions({ supabase: owner.customer }))
      .find(question => question.id === unresolvedIssue.reviewIssueId)).toBeDefined()

    const documentationItems = await owner.customer.from('bookkeeping_weekly_documentation_batch_items')
      .select('bookkeeping_record_id,receipt_lost_event_id').eq('batch_id', documentation.data.batch_id)
    expect(documentationItems.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ bookkeeping_record_id: questioned.recordId,
        receipt_lost_event_id: expect.any(String) }),
      expect.objectContaining({ bookkeeping_record_id: existing.recordId,
        receipt_lost_event_id: expect.any(String) }),
      expect.objectContaining({ bookkeeping_record_id: limited.recordId,
        receipt_lost_event_id: expect.any(String) }),
    ]))
    const transactionState = await listTransactionReadModel({ supabase: owner.customer,
      userId: owner.userId, start: '2026-08-01', end: '2026-08-07' })
    expect(transactionState).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: questioned.financialTransactionId, treatment: 'mixed_use',
        has_receipt: false, receiptLost: true }),
      expect.objectContaining({ id: existing.financialTransactionId, treatment: 'mixed_use',
        has_receipt: false, receiptLost: true }),
    ]))

    let workflowEventId = documentation.data.workflow_event_id as string
    for (const stage of ['questions', 'final'] as const) {
      const result = await owner.customer.rpc('append_weekly_review_workflow_event', {
        p_review_period_id: period.id, p_expected_event_id: workflowEventId, p_stage: stage,
        p_event_type: 'stage_completed', p_details: {}, p_request_id: crypto.randomUUID(),
      })
      expect(result.error).toBeNull()
      workflowEventId = result.data!
    }
    const membership = await admin.from('business_memberships').insert({ business_id: owner.businessId,
      plan: 'business', lifecycle: 'active', authority: 'grant' })
    expect(membership.error).toBeNull()
    expect(await prepareWeeklyReviews({ admin, asOf: '2026-08-08', businessId: owner.businessId }))
      .toMatchObject({ presented: 1, waiting: 0 })

    const review = await getCurrentCustomerWeeklyReview(owner.customer)
    expect(review?.snapshotId).toBeTruthy()
    expect(review?.expenseCents).toBe(24_000)
    expect(review?.missingDocumentationCount).toBe(3)
    expect(review?.unresolvedQuestionCount).toBe(1)
    expect(review?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ recordId: questioned.recordId, decisionId: answer.decision.id,
        treatment: 'mixed_use', amountCents: -12_000 }),
      expect.objectContaining({ recordId: existing.recordId, decisionId: existingMixed.id,
        treatment: 'mixed_use', amountCents: -7_000 }),
    ]))
    expect(reviewTreatmentLabel(review!.items.find(item => item.recordId === questioned.recordId)!))
      .toBe('Business + personal')
    const snapshotItems = await owner.customer.from('bookkeeping_review_snapshot_items')
      .select('bookkeeping_record_id,bookkeeping_decision_id,treatment,signed_business_amount_cents')
      .eq('review_snapshot_id', review!.snapshotId)
    expect(snapshotItems.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ bookkeeping_record_id: questioned.recordId,
        bookkeeping_decision_id: answer.decision.id, treatment: 'mixed_use',
        signed_business_amount_cents: -12_000 }),
      expect.objectContaining({ bookkeeping_record_id: existing.recordId,
        bookkeeping_decision_id: existingMixed.id, treatment: 'mixed_use',
        signed_business_amount_cents: -7_000 }),
    ]))

    const report = await getAuthenticatedCanonicalReport({ supabase: owner.customer,
      periodStart: '2026-08-01', periodEnd: '2026-08-07' })
    expect(report.businessExpensesCents).toBe(24_000)
    expect(report.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ recordId: questioned.recordId, treatment: 'Business and personal',
        businessAmountCents: 12_000, personalAmountCents: 6_600 }),
      expect.objectContaining({ recordId: existing.recordId, treatment: 'Business and personal',
        businessAmountCents: 7_000, personalAmountCents: 3_000 }),
    ]))
    const questionedHistory = transactionState.find(row => row.id === questioned.financialTransactionId)!.history
    expect(questionedHistory.map(item => item.summary)).toEqual([
      'Business and personal', 'Business', 'Still being worked on',
    ])
    expect(questionedHistory[0].id).toBe(answer.decision.id)
  })

  it('marks unresolved imported activity personal, closes its question, and reverses append-only', async () => {
    const admin = client(serviceKey!)
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'weekly-personal-unresolved', amounts: [-1_000] })
    const resolved = await resolveFinancialTransactionRecord({ supabase: owner.customer,
      financialTransactionId: owner.transactionIds[0] })
    const question = await new CanonicalWeeklyReviewService(new SupabaseBookkeepingRepository(admin)).openIssue({
      businessId: owner.businessId, recordId: resolved.record.id, decisionId: resolved.decision.id,
      reason: 'BUSINESS_USE_UNCLEAR', issueKey: 'business-use:v1', contextFingerprint: 'local:v1',
    })
    expect(await listCanonicalReviewQueue({ supabase: owner.customer })).toHaveLength(1)
    const personal = await correctCanonicalTransactionUse({ supabase: owner.customer,
      financialTransactionId: owner.transactionIds[0], expectedCurrentDecisionId: resolved.decision.id,
      correctionRequestId: crypto.randomUUID(), answer: { schemaVersion: 1, use: 'personal' } }) as Record<string, unknown>
    expect(await listCanonicalReviewQueue({ supabase: owner.customer })).toEqual([])
    const current = await owner.customer.from('bookkeeping_decisions').select('treatment,bookkeeping_nature')
      .eq('id', personal.decision_id).single()
    expect(current.data).toEqual({ treatment: 'personal', bookkeeping_nature: null })
    await correctCanonicalTransactionUse({ supabase: owner.customer,
      financialTransactionId: owner.transactionIds[0], expectedCurrentDecisionId: personal.decision_id as string,
      correctionRequestId: crypto.randomUUID(), answer: { schemaVersion: 1, use: 'restore_previous' } })
    expect((await listCanonicalReviewQueue({ supabase: owner.customer }))[0].event)
      .toMatchObject({ eventType: 'reopened', reviewIssueId: question.reviewIssueId })
    const history = await owner.customer.from('bookkeeping_decisions').select('treatment')
      .eq('bookkeeping_record_id', resolved.record.id).order('created_at')
    expect(history.data?.map(row => row.treatment)).toEqual(['unresolved', 'personal', 'unresolved'])
  })

  it('atomically includes an explicit missing-receipt set and retries idempotently', async () => {
    const admin = client(serviceKey!)
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'weekly-doc-include', amounts: [-1_000, -2_000] })
    const expenses = [await establishExpense(owner, 0), await establishExpense(owner, 1)]
    await Promise.all(expenses.map(item => openMissing(admin, owner.businessId, item.recordId)))
    const period = await createPeriod(admin, owner)
    const requestId = crypto.randomUUID()
    const input = { p_review_period_id: period.id, p_expected_workflow_event_id: period.eventId,
      p_request_id: requestId, p_decision: 'include_missing',
      p_record_ids: expenses.map(item => item.recordId), p_complete_stage: true }
    const first = await owner.customer.rpc('complete_weekly_missing_documentation_decision', input)
    expect(first.error).toBeNull()
    const retry = await owner.customer.rpc('complete_weekly_missing_documentation_decision', input)
    expect(retry.data).toMatchObject({ batch_id: first.data.batch_id,
      workflow_event_id: first.data.workflow_event_id, idempotent: true })
    const items = await owner.customer.from('bookkeeping_weekly_documentation_batch_items')
      .select('bookkeeping_record_id').eq('batch_id', first.data.batch_id)
    expect(items.data).toHaveLength(2)
    const decisions = await owner.customer.from('bookkeeping_decisions').select('treatment')
      .in('id', expenses.map(item => item.decision.id))
    expect(decisions.data?.map(row => row.treatment)).toEqual(['business', 'business'])
  })

  it('rolls back an incomplete batch, keeps exclusion distinct from personal, and enforces tenant scope', async () => {
    const admin = client(serviceKey!)
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'weekly-doc-exclude', amounts: [-1_000, -2_000] })
    const expenses = [await establishExpense(owner, 0), await establishExpense(owner, 1)]
    const requests = await Promise.all(expenses.map(item => openMissing(admin, owner.businessId, item.recordId)))
    const period = await createPeriod(admin, owner)
    const incompleteRequest = crypto.randomUUID()
    const incomplete = await owner.customer.rpc('complete_weekly_missing_documentation_decision', {
      p_review_period_id: period.id, p_expected_workflow_event_id: period.eventId,
      p_request_id: incompleteRequest, p_decision: 'exclude_missing',
      p_record_ids: [expenses[0].recordId], p_complete_stage: true })
    expect(incomplete.error?.message).toMatch(/incomplete/i)
    expect((await owner.customer.from('bookkeeping_weekly_documentation_batches')
      .select('id').eq('request_id', incompleteRequest)).data).toEqual([])
    expect((await owner.customer.from('bookkeeping_documentation_events').select('event_type')
      .eq('documentation_issue_id', requests[0].documentationIssueId)).data).toHaveLength(1)

    const excluded = await owner.customer.rpc('complete_weekly_missing_documentation_decision', {
      p_review_period_id: period.id, p_expected_workflow_event_id: period.eventId,
      p_request_id: crypto.randomUUID(), p_decision: 'exclude_missing',
      p_record_ids: expenses.map(item => item.recordId), p_complete_stage: true })
    expect(excluded.error).toBeNull()
    const current = await owner.customer.from('bookkeeping_decisions').select('id,treatment,reason,provenance')
      .eq('bookkeeping_record_id', expenses[0].recordId).eq('treatment', 'excluded').single()
    expect(current.data).toMatchObject({ treatment: 'excluded', provenance: 'user' })
    expect(current.data?.reason).toMatch(/documentation/i)
    const allocation = await owner.customer.from('bookkeeping_allocations').select('allocation_kind')
      .eq('bookkeeping_decision_id', current.data!.id).single()
    expect(allocation.data).toEqual({ allocation_kind: 'excluded' })

    const other = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!,
      label: 'weekly-doc-other', amounts: [-1_000] })
    const crossTenant = await other.customer.rpc('restore_documentation_excluded_transaction', {
      p_financial_transaction_id: expenses[0].financialTransactionId,
      p_expected_current_decision_id: current.data!.id, p_correction_request_id: crypto.randomUUID() })
    expect(crossTenant.error).not.toBeNull()
    const restored = await correctCanonicalTransactionUse({ supabase: owner.customer,
      financialTransactionId: expenses[0].financialTransactionId,
      expectedCurrentDecisionId: current.data!.id, correctionRequestId: crypto.randomUUID(),
      answer: { schemaVersion: 1, use: 'restore_exclusion' } }) as Record<string, unknown>
    const restoredDecision = await owner.customer.from('bookkeeping_decisions').select('treatment')
      .eq('id', restored.decision_id).single()
    expect(restoredDecision.data).toEqual({ treatment: 'business' })
  })
})
