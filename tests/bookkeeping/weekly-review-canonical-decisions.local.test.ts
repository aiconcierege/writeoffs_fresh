import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { CanonicalBookkeepingService } from '../../app/lib/bookkeeping/service'
import { CanonicalDocumentationService } from '../../app/lib/bookkeeping/documentation-events'
import { CanonicalWeeklyReviewService } from '../../app/lib/bookkeeping/review-events'
import { resolveFinancialTransactionRecord } from '../../app/lib/bookkeeping/financial-transaction-workflow'
import { SupabaseBookkeepingRepository } from '../../app/lib/bookkeeping/supabase-repository'
import { correctCanonicalTransactionUse } from '../../app/lib/bookkeeping/transaction-corrections'
import { listCanonicalReviewQueue } from '../../app/lib/bookkeeping/review-queue'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const runLocal = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const client = (key: string) => createClient(url!, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function establishExpense(owner: Awaited<ReturnType<typeof provisionLocalCanonicalOwner>>, index: number) {
  const financialTransactionId = owner.transactionIds[index]
  const resolved = await resolveFinancialTransactionRecord({ supabase: owner.customer, financialTransactionId })
  const amount = [-1_000, -2_000][index] ?? -1_000
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
    check_in_weekday: 5, timezone_name: 'America/Phoenix', effective_from: '2026-08-01',
    provenance: 'system' }).select('id').single()
  if (cadence.error) throw cadence.error
  const period = await admin.from('bookkeeping_review_periods').insert({ business_id: owner.businessId,
    period_start: '2026-08-01', period_end: '2026-08-07', check_in_date: '2026-08-08',
    cadence_event_id: cadence.data.id, membership_scope: 'business' }).select('id').single()
  if (period.error) throw period.error
  let eventId: string | null = null
  for (const stage of ['personal', 'mixed', 'questions'] as const) {
    const result: { data: string | null; error: { message: string } | null } = await owner.customer.rpc('append_weekly_review_workflow_event', {
      p_review_period_id: period.data.id, p_expected_event_id: eventId, p_stage: stage,
      p_event_type: 'stage_completed', p_details: {}, p_request_id: crypto.randomUUID(),
    })
    if (result.error) throw result.error
    eventId = result.data
  }
  return { id: period.data.id as string, eventId: eventId! }
}

async function openMissing(admin: SupabaseClient, businessId: string, recordId: string) {
  return new CanonicalDocumentationService(new SupabaseBookkeepingRepository(admin)).openRequest({
    businessId, recordId, reason: 'MISSING_SUPPORTING_DOCUMENTATION',
    issueKey: `missing:${recordId}`, contextFingerprint: `missing:${recordId}:v1`,
    questionContext: { schemaVersion: 1, reason: 'MISSING_SUPPORTING_DOCUMENTATION' },
  })
}

describe.skipIf(!runLocal)('weekly review canonical exception decisions on local Supabase', () => {
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
