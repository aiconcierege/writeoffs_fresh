import 'server-only'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  configuredBookkeepingAiGateway,
  type BookkeepingAiGateway,
} from './ai-gateway'
import { buildAiBookkeepingEvidence } from './ai-evidence'
import {
  BOOKKEEPING_AI_EVALUATOR_VERSION,
  BOOKKEEPING_AI_EVIDENCE_VERSION,
  BOOKKEEPING_AI_OUTPUT_SCHEMA_VERSION,
  BOOKKEEPING_AI_PROMPT_VERSION,
  diagnoseAiBookkeepingOutput,
  parseAiBookkeepingOutput,
  type AiBookkeepingOutput,
  type AiEvidenceId,
  type AiGatewayResult,
} from './ai-shadow-types'
import type { BookkeepingEvaluationSnapshot } from './deterministic-evaluator'
import { SupabaseBookkeepingRepository } from './supabase-repository'

export type AiShadowValidation = {
  accepted: boolean
  codes: string[]
  questionEligible: boolean | null
  output: AiBookkeepingOutput | null
  diagnostics: ReturnType<typeof diagnoseAiBookkeepingOutput>
}

function unique(values: string[]) { return [...new Set(values)] }

export function validateAiShadowOutput(input: {
  rawOutput: unknown
  snapshot: BookkeepingEvaluationSnapshot
  evidenceFingerprint: string
  currentEvidenceFingerprint: string
}) : AiShadowValidation {
  const output = parseAiBookkeepingOutput(input.rawOutput)
  if (!output) return {
    accepted: false,
    codes: ['MALFORMED_STRUCTURED_OUTPUT'],
    questionEligible: null,
    output: null,
    diagnostics: diagnoseAiBookkeepingOutput(input.rawOutput),
  }
  const codes: string[] = []
  if (input.evidenceFingerprint !== input.currentEvidenceFingerprint) codes.push('STALE_EVIDENCE')
  if (input.snapshot.currentDecision.treatment !== 'unresolved') codes.push('DECISION_NOT_UNRESOLVED')
  if (input.snapshot.currentDecision.provenance === 'user') codes.push('CUSTOMER_DECISION_CURRENT')
  if (input.snapshot.hasOpenConflictingEvidence && output.outcome === 'propose_decision') {
    codes.push('OPEN_CONFLICTING_EVIDENCE')
  }
  if (input.snapshot.movement && (!input.snapshot.movement.sourceCurrent || input.snapshot.movement.pending)) {
    codes.push('SOURCE_STATE_UNSUPPORTED')
  }
  const available = new Set(buildAiBookkeepingEvidence(input.snapshot)?.evidence.availableEvidenceIds ?? [])
  for (const reference of output.evidenceReferences) {
    if (!available.has(reference)) codes.push('INVENTED_EVIDENCE_REFERENCE')
  }

  let questionEligible: boolean | null = null
  if (output.outcome === 'propose_decision') {
    if (input.snapshot.amountCents == null
      || output.businessAmountCents !== input.snapshot.amountCents
      || output.excludedAmountCents !== 0) codes.push('ALLOCATION_DOES_NOT_RECONCILE')
    const references = new Set<AiEvidenceId>(output.evidenceReferences)
    const support = new Set(output.supportCodes)
    const customerSupported = support.has('CUSTOMER_FACT_SUPPORT')
      && references.has('customer.answers') && input.snapshot.customerAnswerCount > 0
    const documentSupported = support.has('DOCUMENT_SUPPORT')
      && support.has('DESCRIPTION_SUPPORT')
      && support.has('BUSINESS_CONTEXT_MATCH')
      && references.has('documents.presence')
      && references.has('transaction.description')
      && references.has('business.description')
      && input.snapshot.activeDocumentCount > 0
    if (!customerSupported && !documentSupported) codes.push('BUSINESS_USE_NOT_SUPPORTED')
    if (support.size === 1 && support.has('MERCHANT_SUPPORT_ONLY')) {
      codes.push('MERCHANT_ONLY_NOT_AUTHORITY')
    }
  } else if (output.outcome === 'request_fact') {
    const age = buildAiBookkeepingEvidence(input.snapshot)?.evidence.ageDays
    questionEligible = age != null && age <= 30
    if (!questionEligible) codes.push('HISTORICAL_QUESTION_INELIGIBLE')
  }
  return {
    accepted: codes.length === 0,
    codes: unique(codes),
    questionEligible,
    output,
    diagnostics: [],
  }
}

function safeProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (/^AI_PROVIDER_HTTP_\d{3}$/.test(message)) return message
  if ([
    'AI_PROVIDER_TIMEOUT', 'AI_RESPONSE_MISSING_OUTPUT', 'AI_RESPONSE_INVALID_JSON',
  ].includes(message)) return message
  return 'AI_PROVIDER_FAILED'
}

async function completedEvaluationExists(input: {
  admin: SupabaseClient
  businessId: string
  recordId: string
  evidenceFingerprint: string
  gateway: BookkeepingAiGateway
}) {
  const { data, error } = await input.admin.from('bookkeeping_ai_shadow_evaluations')
    .select('id').eq('business_id', input.businessId)
    .eq('bookkeeping_record_id', input.recordId)
    .eq('evidence_fingerprint', input.evidenceFingerprint)
    .eq('evaluator_version', BOOKKEEPING_AI_EVALUATOR_VERSION)
    .eq('prompt_version', BOOKKEEPING_AI_PROMPT_VERSION)
    .eq('output_schema_version', BOOKKEEPING_AI_OUTPUT_SCHEMA_VERSION)
    .eq('provider', input.gateway.provider).eq('model', input.gateway.model)
    .neq('validation_status', 'provider_error').limit(1)
  if (error) throw new Error('AI_SHADOW_AUDIT_UNAVAILABLE')
  return Boolean(data?.length)
}

type AuditInput = {
  admin: SupabaseClient
  businessId: string
  recordId: string
  evidenceFingerprint: string
  gateway: BookkeepingAiGateway
  correlationId: string
  durationMs: number
}

async function persistProviderError(input: AuditInput, errorCode: string) {
  const { error } = await input.admin.from('bookkeeping_ai_shadow_evaluations').insert({
    business_id: input.businessId,
    bookkeeping_record_id: input.recordId,
    evidence_fingerprint: input.evidenceFingerprint,
    evidence_version: BOOKKEEPING_AI_EVIDENCE_VERSION,
    evaluator_version: BOOKKEEPING_AI_EVALUATOR_VERSION,
    prompt_version: BOOKKEEPING_AI_PROMPT_VERSION,
    output_schema_version: BOOKKEEPING_AI_OUTPUT_SCHEMA_VERSION,
    provider: input.gateway.provider,
    model: input.gateway.model,
    validation_status: 'provider_error',
    validation_codes: [],
    write_enabled: false,
    correlation_id: input.correlationId,
    duration_ms: input.durationMs,
    provider_error_code: errorCode,
  })
  if (error) throw new Error('AI_SHADOW_AUDIT_WRITE_FAILED')
}

async function persistResult(input: AuditInput & {
  result: AiGatewayResult
  validation: AiShadowValidation
}) {
  const storedOutput = input.validation.output ?? {
    outcome: 'abstain',
    reason: 'invalid_model_output',
    diagnostics: input.validation.diagnostics,
  }
  const modelOutcome = input.validation.output?.outcome ?? 'abstain'
  const { error } = await input.admin.from('bookkeeping_ai_shadow_evaluations').insert({
    business_id: input.businessId,
    bookkeeping_record_id: input.recordId,
    evidence_fingerprint: input.evidenceFingerprint,
    evidence_version: BOOKKEEPING_AI_EVIDENCE_VERSION,
    evaluator_version: BOOKKEEPING_AI_EVALUATOR_VERSION,
    prompt_version: BOOKKEEPING_AI_PROMPT_VERSION,
    output_schema_version: BOOKKEEPING_AI_OUTPUT_SCHEMA_VERSION,
    provider: input.gateway.provider,
    model: input.gateway.model,
    model_outcome: modelOutcome,
    structured_proposal: storedOutput,
    referenced_evidence_ids: input.validation.output?.evidenceReferences ?? [],
    validation_status: input.validation.accepted ? 'accepted' : 'rejected',
    validation_codes: input.validation.codes,
    question_eligible: input.validation.questionEligible,
    write_enabled: false,
    correlation_id: input.correlationId,
    provider_request_id: input.result.providerRequestId,
    duration_ms: input.durationMs,
    input_tokens: input.result.inputTokens,
    output_tokens: input.result.outputTokens,
    total_tokens: input.result.totalTokens,
  })
  if (error?.code === '23505') return false
  if (error) throw new Error('AI_SHADOW_AUDIT_WRITE_FAILED')
  return true
}

export async function runAiShadowEvaluation(input: {
  admin: SupabaseClient
  snapshot: BookkeepingEvaluationSnapshot
  gateway?: BookkeepingAiGateway | null
  now?: Date
}) {
  const gateway = input.gateway === undefined ? configuredBookkeepingAiGateway() : input.gateway
  if (!gateway) return { outcome: 'disabled' as const }
  const built = buildAiBookkeepingEvidence(input.snapshot, input.now)
  if (!built || input.snapshot.currentDecision.provenance === 'user'
    || input.snapshot.hasOpenConflictingEvidence
    || (input.snapshot.movement && (!input.snapshot.movement.sourceCurrent || input.snapshot.movement.pending))) {
    return { outcome: 'ineligible' as const }
  }
  const identity = {
    admin: input.admin,
    businessId: input.snapshot.businessId,
    recordId: input.snapshot.recordId,
    evidenceFingerprint: built.evidenceFingerprint,
    gateway,
  }
  if (await completedEvaluationExists(identity)) return { outcome: 'cached' as const }

  const correlationId = randomUUID()
  const started = Date.now()
  let result: AiGatewayResult
  try {
    result = await gateway.evaluate({ evidence: built.evidence, correlationId })
  } catch (error) {
    const errorCode = safeProviderError(error)
    await persistProviderError({
      ...identity, correlationId, durationMs: Date.now() - started,
    }, errorCode)
    throw new Error(errorCode)
  }

  const currentDecision = await new SupabaseBookkeepingRepository(input.admin)
    .findCurrentDecision(input.snapshot.businessId, input.snapshot.recordId)
  const currentSnapshot = currentDecision
    ? { ...input.snapshot, currentDecision }
    : input.snapshot
  const currentBuilt = buildAiBookkeepingEvidence(currentSnapshot, input.now)
  const validation = validateAiShadowOutput({
    rawOutput: result.output,
    snapshot: currentSnapshot,
    evidenceFingerprint: built.evidenceFingerprint,
    currentEvidenceFingerprint: currentBuilt?.evidenceFingerprint ?? 'stale',
  })
  const inserted = await persistResult({
    ...identity,
    correlationId,
    durationMs: Date.now() - started,
    result,
    validation,
  })
  return {
    outcome: inserted ? 'recorded' as const : 'cached' as const,
    accepted: validation.accepted,
    validationCodes: validation.codes,
  }
}
