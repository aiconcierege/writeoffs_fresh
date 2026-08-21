import 'server-only'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerAdminSupabase } from '../../../utils/supabase/admin'
import { applyAutomatedBookkeepingDecision } from './agent-resolution'
import {
  decisionMatchesProposal,
  evaluateDeterministicBookkeeping,
} from './deterministic-evaluator'
import { loadBookkeepingEvaluationSnapshot } from './evaluation-snapshot'
import { SupabaseBookkeepingRepository } from './supabase-repository'

type Row = Record<string, unknown>

export const MAX_BOOKKEEPING_PROCESSING_BATCH = 25

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value as Row[] : value ? [value as Row] : []
}

function safeErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : 'UNKNOWN'
  if (message === 'CURRENT_DECISION_UNAVAILABLE') return message
  if (message === 'BOOKKEEPING_RECORD_UNAVAILABLE') return message
  return 'BOOKKEEPING_PROCESSING_FAILED'
}

function staleDecisionError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('decision changed')
    || message.includes('reevaluate before saving')
    || message.includes('cannot silently supersede a user decision')
}

export async function evaluateBookkeepingProcessingJob(admin: SupabaseClient, job: Row) {
  const businessId = String(job.business_id ?? '')
  const recordId = String(job.bookkeeping_record_id ?? '')
  if (!businessId || !recordId) throw new Error('BOOKKEEPING_RECORD_UNAVAILABLE')
  if (job.processing_reason !== 'deterministic_evaluation'
    || !String(job.target_fingerprint ?? '').startsWith('bookkeeping-evaluator:v1:record:')) {
    return { outcome: 'legacy_noop' as const }
  }

  const snapshot = await loadBookkeepingEvaluationSnapshot({ admin, businessId, recordId })
  const evaluation = evaluateDeterministicBookkeeping(snapshot)
  if (!evaluation) return { outcome: 'unresolved' as const }
  if (decisionMatchesProposal(snapshot.currentDecision, evaluation.proposal)) {
    return { outcome: 'already_resolved' as const, ruleKey: evaluation.ruleKey }
  }
  try {
    const decision = await applyAutomatedBookkeepingDecision({
      repository: new SupabaseBookkeepingRepository(admin),
      businessId,
      recordId: snapshot.recordId,
      expectedCurrentDecisionId: snapshot.currentDecision.id,
      proposal: evaluation.proposal,
    })
    return { outcome: 'resolved' as const, ruleKey: evaluation.ruleKey, decisionId: decision.id }
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
  const leaseId = randomUUID()
  const { data, error } = await admin.rpc('claim_bookkeeping_processing_jobs', {
    p_lease_id: leaseId,
    p_limit: batchSize,
    p_lease_seconds: 60,
  })
  if (error) throw new Error(`BOOKKEEPING_PROCESSING_CLAIM_FAILED:${error.message}`)

  const claimed = rows(data)
  const processor = input.processor ?? evaluateBookkeepingProcessingJob
  let completed = 0
  let retried = 0
  for (const job of claimed) {
    const jobId = String(job.id ?? '')
    try {
      await processor(admin, job)
      const { data: didComplete, error: completeError } = await admin.rpc(
        'complete_bookkeeping_processing_job',
        { p_job_id: jobId, p_lease_id: leaseId },
      )
      if (completeError || didComplete !== true) throw new Error('PROCESSING_LEASE_LOST')
      completed += 1
    } catch (processingError) {
      const errorCode = safeErrorCode(processingError)
      const { error: retryError } = await admin.rpc('retry_bookkeeping_processing_job', {
        p_job_id: jobId,
        p_lease_id: leaseId,
        p_error_code: errorCode,
      })
      if (retryError) {
        console.error('Bookkeeping processing retry could not be recorded', {
          jobId,
          errorCode: 'BOOKKEEPING_RETRY_STATE_FAILED',
        })
      } else {
        retried += 1
      }
    }
  }
  return { claimed: claimed.length, completed, retried }
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
