import {loadAuthorizedScope,activityIsActive} from './authorized-scope'
import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerAdminSupabase } from '../../../utils/supabase/admin'
import { applyAutomatedBookkeepingDecision } from './agent-resolution'
import {
  decisionMatchesProposal,
  evaluateDeterministicBookkeeping,
} from './deterministic-evaluator'
import { loadBookkeepingEvaluationSnapshot } from './evaluation-snapshot'
import { SupabaseBookkeepingRepository } from './supabase-repository'
import { runAiShadowEvaluation } from './ai-shadow'
import { configuredBookkeepingAiGateway } from './ai-gateway'
import {
  BOOKKEEPING_AI_EVALUATOR_VERSION,
  BOOKKEEPING_AI_OUTPUT_SCHEMA_VERSION,
  BOOKKEEPING_AI_PROMPT_VERSION,
} from './ai-shadow-types'
import { runDeductionIntelligenceForRecord } from './deduction-intelligence'
import { assessBusinessContext, businessContextAllocationDomain } from './business-context'
import { processOperatingExpenseTreatment } from './operating-expense-processing'
import { processVehicleExpense } from './vehicle-processing'
import {applyRememberedPayment} from './recurring-payment'
import {payoutUnderstanding} from './purchase-understanding'
import { supportedMealPurpose } from './shared-evidence'
import { classifyOperatingExpense } from './operating-expense-classification'

type Row = Record<string, unknown>

export const MAX_BOOKKEEPING_PROCESSING_BATCH = 25
export const MAX_AI_SHADOW_EVALUATIONS_PER_DRAIN = 10

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value as Row[] : value ? [value as Row] : []
}

export function safeBookkeepingProcessingDiagnostic(error: unknown) {
  const message = error instanceof Error ? error.message : 'UNKNOWN'
  let code = 'BOOKKEEPING_EVALUATION_ERROR'
  if (message === 'CURRENT_DECISION_UNAVAILABLE' || message === 'BOOKKEEPING_RECORD_UNAVAILABLE'
    || message === 'BOOKKEEPING_RECORD_INACTIVE') code = message
  else if (/^AI_(PROVIDER|RESPONSE)_[A-Z0-9_]+$/.test(message)) code = message
  else if (message === 'PROCESSING_LEASE_LOST') code = message
  else if (message === 'Tax-treatment conclusion key was reused with different content.') {
    code = 'TAX_TREATMENT_IDEMPOTENCY_CONFLICT'
  } else if (/^[A-Z][A-Z0-9_]{2,99}$/.test(message)) code = message
  return { code, fingerprint: createHash('sha256').update(message).digest('hex') }
}

function staleDecisionError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('decision changed')
    || message.includes('reevaluate before saving')
    || message.includes('cannot silently supersede a user decision')
}

async function resolveCurrentQuestions(input: {
  admin: SupabaseClient; businessId: string; recordId: string; reasons: string[]; factTypes?: string[]
}) {
  const { data, error } = await input.admin.from('bookkeeping_review_events')
    .select('id,review_issue_id,question_context')
    .eq('business_id', input.businessId).eq('bookkeeping_record_id', input.recordId)
    .in('reason', input.reasons).in('event_type', ['opened', 'reopened', 'skipped'])
  if (error) throw new Error('EVIDENCE_ROUTING_REVIEW_LOAD_FAILED')
  const ids = (data ?? []).map((event) => event.id)
  const { data: successors, error: successorError } = ids.length
    ? await input.admin.from('bookkeeping_review_events').select('supersedes_event_id')
      .in('supersedes_event_id', ids)
    : { data: [], error: null }
  if (successorError) throw new Error('EVIDENCE_ROUTING_REVIEW_LOAD_FAILED')
  const superseded = new Set((successors ?? []).map((event) => event.supersedes_event_id))
  for (const event of data ?? []) {
    if (input.factTypes && !input.factTypes.includes(event.question_context?.factType)) continue
    if (superseded.has(event.id)) continue
    const { error: insertError } = await input.admin.rpc('resolve_bookkeeping_review_issue', {
      p_business_id: input.businessId, p_review_issue_id: event.review_issue_id,
      p_expected_current_event_id: event.id,
    })
    if (insertError?.code !== '23505') {
      if (insertError) throw new Error(`EVIDENCE_ROUTING_REVIEW_RESOLUTION_FAILED:${insertError.code ?? 'UNKNOWN'}`)
    }
  }
}

async function recordBusinessContextAssessment(admin: SupabaseClient,
  snapshot: Awaited<ReturnType<typeof loadBookkeepingEvaluationSnapshot>>) {
  const assessment = assessBusinessContext(snapshot)
  const { data, error } = await admin.rpc('record_bookkeeping_business_context_assessment', {
    p_business_id: snapshot.businessId, p_bookkeeping_record_id: snapshot.recordId,
    p_assessment_state: assessment.state, p_assessment_basis: assessment.basis,
    p_economic_context: assessment.economicContext, p_evaluator_version: assessment.version,
    p_evidence_fingerprint: assessment.evidenceFingerprint,
    p_evidence_references: assessment.evidenceReferences,
  })
  if (error && error.code !== '42883') throw new Error('BUSINESS_CONTEXT_ASSESSMENT_WRITE_FAILED')
  return { assessment, assessmentId: typeof data === 'string' ? data : null }
}

async function resolveQuestionsFromSupportedEvidence(admin: SupabaseClient,
  snapshot: Awaited<ReturnType<typeof loadBookkeepingEvaluationSnapshot>>) {
  if (snapshot.hasOpenConflictingEvidence) return
  if (snapshot.currentDecision.bookkeepingNature != null) await resolveCurrentQuestions({ admin,
    businessId: snapshot.businessId, recordId: snapshot.recordId, reasons: ['TRANSACTION_TYPE_UNCLEAR'] })
  if (snapshot.currentDecision.treatment !== 'unresolved') await resolveCurrentQuestions({ admin,
    businessId: snapshot.businessId, recordId: snapshot.recordId, reasons: ['BUSINESS_USE_UNCLEAR'] })
  if (classifyOperatingExpense(snapshot).status === 'ordinary') await resolveCurrentQuestions({ admin,
    businessId: snapshot.businessId, recordId: snapshot.recordId, reasons: ['BUSINESS_PURPOSE_NEEDED'],
    factTypes: ['ordinary_expense_purpose'] })
}

async function openBusinessContextMealQuestion(input: { admin: SupabaseClient
  snapshot: Awaited<ReturnType<typeof loadBookkeepingEvaluationSnapshot>>; assessmentId: string | null }) {
  if (!input.assessmentId || input.snapshot.currentDecision.bookkeepingNature !== 'expense'
    || !['business', 'mixed_use'].includes(input.snapshot.currentDecision.treatment)) return
  const assessment = assessBusinessContext(input.snapshot)
  if (!['established', 'customer_authoritative'].includes(assessment.state) || assessment.economicContext !== 'restaurant_meal') return
  const { data: knownMeal, error: mealError } = await input.admin.from('current_bookkeeping_meal_substantiation_facts')
    .select('id').eq('business_id', input.snapshot.businessId).eq('bookkeeping_record_id', input.snapshot.recordId).maybeSingle()
  if (mealError) throw new Error('MEAL_FACT_LOAD_FAILED')
  if (knownMeal && supportedMealPurpose(input.snapshot)) return
  const factType = knownMeal ? 'receipt_meal_business_purpose' : 'meal_attendee_relationship'
  const repository = new SupabaseBookkeepingRepository(input.admin)
  await repository.openReviewIssue({ businessId: input.snapshot.businessId, recordId: input.snapshot.recordId,
    decisionId: input.snapshot.currentDecision.id, reason: 'BUSINESS_PURPOSE_NEEDED',
    issueKey: `business-context-meal:${input.snapshot.recordId}:${factType}`,
    contextFingerprint: `${assessment.evidenceFingerprint}:meal-substantiation`,
    questionContext: { schemaVersion: 1, routingVersion: assessment.version,
      reason: 'BUSINESS_PURPOSE_NEEDED', factType,
      businessContextAssessmentId: input.assessmentId, establishedFacts: ['purchase', 'meal', 'businessContext',
        ...(supportedMealPurpose(input.snapshot) ? ['businessPurpose'] : [])] },
  })
}

async function openRemainingBusinessUseQuestion(input: { admin: SupabaseClient
  snapshot: Awaited<ReturnType<typeof loadBookkeepingEvaluationSnapshot>> }) {
  if ((input.snapshot.amountCents ?? 0) >= 0
    || (input.snapshot.accountProvider === 'statement' && !input.snapshot.accountUse)
    || input.snapshot.currentDecision.bookkeepingNature !== 'expense'
    || input.snapshot.currentDecision.treatment !== 'unresolved'
    || input.snapshot.hasOpenConflictingEvidence) return
  const context = assessBusinessContext(input.snapshot)
  if (context.state === 'established' || context.economicContext === 'telecom_service') return
  const repository = new SupabaseBookkeepingRepository(input.admin)
  await repository.openReviewIssue({ businessId: input.snapshot.businessId, recordId: input.snapshot.recordId,
    decisionId: input.snapshot.currentDecision.id, reason: 'BUSINESS_USE_UNCLEAR',
    issueKey: `business-use:business-context:${input.snapshot.recordId}:${input.snapshot.currentDecision.id}`,
    contextFingerprint: `${context.evidenceFingerprint}:business-use`,
    questionContext: { schemaVersion: 1, routingVersion: context.version,
      reason: 'BUSINESS_USE_UNCLEAR',
      factType: context.economicContext === 'restaurant_meal' ? 'receipt_meal_candidate' : 'business_use',
      establishedFacts: context.economicContext ? ['purchase', context.economicContext] : ['purchase'] },
  })
}

async function openBusinessContextAllocationQuestion(input: { admin: SupabaseClient
  snapshot: Awaited<ReturnType<typeof loadBookkeepingEvaluationSnapshot>> }) {
  const assessment = assessBusinessContext(input.snapshot)
  const domain = businessContextAllocationDomain(input.snapshot)
  if (assessment.state !== 'established' || domain === null
    || input.snapshot.currentDecision.bookkeepingNature !== 'expense'
    || input.snapshot.currentDecision.treatment !== 'unresolved') return
  const repository = new SupabaseBookkeepingRepository(input.admin)
  await repository.openReviewIssue({ businessId: input.snapshot.businessId, recordId: input.snapshot.recordId,
    decisionId: input.snapshot.currentDecision.id, reason: 'MIXED_USE_CLARIFICATION',
    issueKey: `business-context-allocation:${domain}:${input.snapshot.recordId}`,
    contextFingerprint: `${assessment.evidenceFingerprint}:allocation:${domain}`,
    questionContext: { schemaVersion: 1, routingVersion: assessment.version,
      reason: 'MIXED_USE_CLARIFICATION', factType: 'business_use_percentage', businessUse: 'mixed',
      allocationDomain: domain, establishedFacts: ['purchase', 'businessContext'] },
  })
}

async function ensureRemainingNatureQuestion(admin: SupabaseClient, snapshot: Awaited<ReturnType<typeof loadBookkeepingEvaluationSnapshot>>) {
  if (snapshot.currentDecision.provenance === 'user' || snapshot.currentDecision.treatment !== 'unresolved' || snapshot.currentDecision.bookkeepingNature !== null
    || snapshot.amountCents == null || snapshot.hasOpenConflictingEvidence) return
  await new SupabaseBookkeepingRepository(admin).openReviewIssue({ businessId: snapshot.businessId,
    recordId: snapshot.recordId, decisionId: snapshot.currentDecision.id, reason: 'TRANSACTION_TYPE_UNCLEAR',
    issueKey: `nature:${snapshot.recordId}:${snapshot.currentDecision.id}`,
    contextFingerprint: createHash('sha256').update(JSON.stringify({decision:snapshot.currentDecision.id,
      description:snapshot.description,amount:snapshot.amountCents,understanding:payoutUnderstanding(snapshot)})).digest('hex'),
    questionContext: { schemaVersion:1, reason:'TRANSACTION_TYPE_UNCLEAR',
      factType: snapshot.amountCents > 0 ? 'money_in_source' : 'economic_nature',
      understanding:payoutUnderstanding(snapshot) } })
}

export async function evaluateBookkeepingProcessingJob(
  admin: SupabaseClient,
  job: Row,
  options: { allowAiShadow?: boolean; now?: Date } = {},
) {
  const businessId = String(job.business_id ?? '')
  const recordId = String(job.bookkeeping_record_id ?? '')
  if (!businessId || !recordId) throw new Error('BOOKKEEPING_RECORD_UNAVAILABLE')
  const deterministicJob = job.processing_reason === 'deterministic_evaluation'
    && /^bookkeeping-evaluator:v[12]:record:/.test(String(job.target_fingerprint ?? ''))
  const businessContextJob = job.processing_reason === 'business_context_changed'
    && String(job.target_fingerprint ?? '').startsWith('bookkeeping-business-context:v1:')
  const economicEvidenceJob = job.processing_reason === 'source_economic_evidence_v1'
    && String(job.target_fingerprint ?? '').startsWith('source-economic:v1:record:')
  const aiShadowJob = job.processing_reason === 'ai_shadow_evaluation'
    && String(job.target_fingerprint ?? '').startsWith('bookkeeping-ai-shadow:v1:')
  const deductionJob = job.processing_reason === 'deduction_fact_changed'
    && String(job.target_fingerprint ?? '').startsWith('deduction-intelligence:v1:')
  if (!deterministicJob && !businessContextJob && !aiShadowJob && !deductionJob && !economicEvidenceJob) {
    return { outcome: 'legacy_noop' as const }
  }

  const scope = await loadAuthorizedScope(admin, businessId)
  const retained = await admin.from('bookkeeping_records').select('occurred_on').eq('business_id',businessId).eq('id',recordId).maybeSingle()
  if(retained.error || !retained.data)throw new Error('BOOKKEEPING_RECORD_UNAVAILABLE')
  if(!activityIsActive(retained.data.occurred_on,scope))return {outcome:'outside_scope' as const}

  let snapshot = await loadBookkeepingEvaluationSnapshot({ admin, businessId, recordId }).catch((error) => {
    if (error instanceof Error && error.message === 'BOOKKEEPING_RECORD_INACTIVE') return null
    throw error
  })
  if (!snapshot) return { outcome: 'inactive' as const }
  if (await applyRememberedPayment(admin,snapshot)) snapshot=await loadBookkeepingEvaluationSnapshot({admin,businessId,recordId})
  await resolveQuestionsFromSupportedEvidence(admin, snapshot)
  const { assessment: contextAssessment, assessmentId: contextAssessmentId } = await recordBusinessContextAssessment(admin, snapshot)
  if (contextAssessment.state === 'established'
    && snapshot.currentDecision.bookkeepingNature === 'expense') {
    await resolveCurrentQuestions({ admin, businessId, recordId: snapshot.recordId,
      reasons: ['BUSINESS_USE_UNCLEAR'] })
    await openBusinessContextAllocationQuestion({ admin, snapshot })
  }
  if (deductionJob) {
    const deduction = await runDeductionIntelligenceForRecord({ admin, snapshot, now: options.now })
    return { outcome: 'deduction_reevaluated' as const, deduction: deduction.outcome }
  }
  const evaluation = evaluateDeterministicBookkeeping(snapshot)
  if (!evaluation) {
    const aiShadow = options.allowAiShadow === false
      ? { outcome: 'drain_limit' as const }
      : await runAiShadowEvaluation({ admin, snapshot, now: options.now })
    const deduction = await runDeductionIntelligenceForRecord({ admin, snapshot, now: options.now })
    await openBusinessContextMealQuestion({ admin, snapshot, assessmentId: contextAssessmentId })
    await openRemainingBusinessUseQuestion({ admin, snapshot })
    await ensureRemainingNatureQuestion(admin, snapshot)
    const operatingExpense = await processOperatingExpenseTreatment({ admin, snapshot })
    const vehicleExpense = await processVehicleExpense({admin,snapshot})
    return { outcome: 'unresolved' as const, aiShadow: aiShadow.outcome,
      deduction: deduction.outcome, operatingExpense: operatingExpense.outcome,vehicleExpense:vehicleExpense.outcome }
  }
  if (decisionMatchesProposal(snapshot.currentDecision, evaluation.proposal)) {
    const deduction = await runDeductionIntelligenceForRecord({ admin, snapshot, now: options.now })
    await openBusinessContextMealQuestion({ admin, snapshot, assessmentId: contextAssessmentId })
    await openRemainingBusinessUseQuestion({ admin, snapshot })
    await ensureRemainingNatureQuestion(admin, snapshot)
    const operatingExpense=await processOperatingExpenseTreatment({admin,snapshot})
    const vehicleExpense=await processVehicleExpense({admin,snapshot})
    return { outcome: 'already_resolved' as const, ruleKey: evaluation.ruleKey,
      deduction: deduction.outcome,operatingExpense:operatingExpense.outcome,vehicleExpense:vehicleExpense.outcome }
  }
  try {
    const decision = await applyAutomatedBookkeepingDecision({
      repository: new SupabaseBookkeepingRepository(admin),
      businessId,
      recordId: snapshot.recordId,
      expectedCurrentDecisionId: snapshot.currentDecision.id,
      proposal: evaluation.proposal,
    })
    if (evaluation.ruleKey.startsWith('bookkeeping.economic_context.')) {
      await resolveCurrentQuestions({ admin, businessId, recordId: snapshot.recordId,
        reasons: ['TRANSACTION_TYPE_UNCLEAR'],
      })
    }
    let refreshed = await loadBookkeepingEvaluationSnapshot({ admin, businessId, recordId })
    // A business-context decision and Schedule C category are independent
    // conclusions. Reassess once after the first decision so a newly established
    // business expense can be categorized in the same autonomous worker run.
    const categoryEvaluation = evaluateDeterministicBookkeeping(refreshed)
    if (categoryEvaluation?.ruleKey === 'bookkeeping.schedule_c.operating_expense.v1'
      && !decisionMatchesProposal(refreshed.currentDecision, categoryEvaluation.proposal)) {
      await applyAutomatedBookkeepingDecision({ repository: new SupabaseBookkeepingRepository(admin),
        businessId, recordId: refreshed.recordId, expectedCurrentDecisionId: refreshed.currentDecision.id,
        proposal: categoryEvaluation.proposal })
      refreshed = await loadBookkeepingEvaluationSnapshot({ admin, businessId, recordId })
    }
    await ensureRemainingNatureQuestion(admin, refreshed)
    await resolveQuestionsFromSupportedEvidence(admin, refreshed)
    const refreshedContext = await recordBusinessContextAssessment(admin, refreshed)
    await openBusinessContextMealQuestion({ admin, snapshot: refreshed,
      assessmentId: refreshedContext.assessmentId })
    await openRemainingBusinessUseQuestion({ admin, snapshot: refreshed })
    await openBusinessContextAllocationQuestion({ admin, snapshot: refreshed })
    const deduction = await runDeductionIntelligenceForRecord({ admin, snapshot: refreshed, now: options.now })
    const operatingExpense = await processOperatingExpenseTreatment({ admin, snapshot: refreshed })
    const vehicleExpense = await processVehicleExpense({admin,snapshot:refreshed})
    return { outcome: 'resolved' as const, ruleKey: evaluation.ruleKey, decisionId: decision.id,
      deduction: deduction.outcome, operatingExpense: operatingExpense.outcome,vehicleExpense:vehicleExpense.outcome }
  } catch (error) {
    if (staleDecisionError(error)) return { outcome: 'stale' as const }
    throw error
  }
}

export async function drainBookkeepingProcessingJobs(input: {
  batchSize?: number
  admin?: SupabaseClient
  processor?: (admin: SupabaseClient, job: Row) => Promise<unknown>
} = {}) {
  const admin = input.admin ?? createServerAdminSupabase()
  const batchSize = Math.max(1, Math.min(
    MAX_BOOKKEEPING_PROCESSING_BATCH,
    Math.trunc(input.batchSize ?? 10),
  ))
  const processor = input.processor
  let claimed = 0
  let completed = 0
  let retried = 0
  for (let index = 0; index < batchSize; index += 1) {
    // Claim only work that this invocation is ready to start. A batch-wide
    // lease can expire on later rows while earlier rows are still doing I/O.
    const leaseId = randomUUID()
    const { data, error } = await admin.rpc('claim_bookkeeping_processing_jobs', {
      p_lease_id: leaseId,
      p_limit: 1,
      p_lease_seconds: 60,
    })
    if (error) throw new Error(`BOOKKEEPING_PROCESSING_CLAIM_FAILED:${error.message}`)
    const job = rows(data)[0]
    if (!job) break
    claimed += 1
    const jobId = String(job.id ?? '')
    const startedAt = Date.now()
    try {
      if (processor) await processor(admin, job)
      else await evaluateBookkeepingProcessingJob(admin, job, {
        allowAiShadow: index < MAX_AI_SHADOW_EVALUATIONS_PER_DRAIN,
      })
      const { data: didComplete, error: completeError } = await admin.rpc(
        'complete_bookkeeping_processing_job',
        { p_job_id: jobId, p_lease_id: leaseId },
      )
      if (completeError || didComplete !== true) throw new Error('PROCESSING_LEASE_LOST')
      completed += 1
    } catch (processingError) {
      const diagnostic = safeBookkeepingProcessingDiagnostic(processingError)
      const { error: retryError } = await admin.rpc('retry_bookkeeping_processing_job_diagnostic', {
        p_job_id: jobId,
        p_lease_id: leaseId,
        p_error_code: diagnostic.code,
        p_error_stage: processingError instanceof Error && processingError.message === 'PROCESSING_LEASE_LOST'
          ? 'completion' : 'bookkeeping_evaluation',
        p_diagnostic_code: diagnostic.code,
        p_error_fingerprint: diagnostic.fingerprint,
        p_duration_ms: Date.now() - startedAt,
      })
      if (retryError) {
        console.error('Bookkeeping processing retry could not be recorded', {
          jobId,
          errorCode: 'BOOKKEEPING_RETRY_STATE_FAILED',
          diagnosticCode: diagnostic.code,
        })
      } else {
        retried += 1
      }
    }
  }
  return { claimed, completed, retried }
}

export async function enqueueUnresolvedBookkeepingRecords(input: {
  limit?: number
  admin?: SupabaseClient
} = {}) {
  const admin = input.admin ?? createServerAdminSupabase()
  const limit = Math.max(1, Math.min(500, Math.trunc(input.limit ?? 100)))
  const { data, error } = await admin.rpc('enqueue_unresolved_bookkeeping_processing_jobs', {
    p_limit: limit,
  })
  if (error) throw new Error(`BOOKKEEPING_RECONCILIATION_FAILED:${error.message}`)
  return Number(data ?? 0)
}

export async function enqueueUnresolvedAiShadowRecords(input: {
  limit?: number
  admin?: SupabaseClient
} = {}) {
  const admin = input.admin ?? createServerAdminSupabase()
  const gateway = configuredBookkeepingAiGateway()
  if (!gateway) return 0
  const limit = Math.max(1, Math.min(500, Math.trunc(input.limit ?? 100)))
  const configurationFingerprint = createHash('sha256').update([
    gateway.provider,
    gateway.model,
    BOOKKEEPING_AI_EVALUATOR_VERSION,
    BOOKKEEPING_AI_PROMPT_VERSION,
    BOOKKEEPING_AI_OUTPUT_SCHEMA_VERSION,
  ].join(':')).digest('hex')
  const { data, error } = await admin.rpc('enqueue_unresolved_bookkeeping_ai_shadow_jobs', {
    p_limit: limit,
    p_configuration_fingerprint: configurationFingerprint,
  })
  if (error) throw new Error(`AI_SHADOW_RECONCILIATION_FAILED:${error.message}`)
  return Number(data ?? 0)
}
