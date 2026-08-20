import 'server-only'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerAdminSupabase } from '../../../utils/supabase/admin'

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

async function inspectCanonicalRecord(admin: SupabaseClient, job: Row) {
  const businessId = String(job.business_id ?? '')
  const recordId = String(job.bookkeeping_record_id ?? '')
  if (!businessId || !recordId) throw new Error('BOOKKEEPING_RECORD_UNAVAILABLE')

  const { data: record, error: recordError } = await admin
    .from('bookkeeping_records')
    .select('id,business_id,source_kind,ingestion_key,amount_cents,currency,occurred_on')
    .eq('id', recordId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (recordError || !record) throw new Error('BOOKKEEPING_RECORD_UNAVAILABLE')

  const { data: decisions, error: decisionError } = await admin
    .from('bookkeeping_decisions')
    .select('id,supersedes_decision_id,treatment,review_status,provenance')
    .eq('bookkeeping_record_id', recordId)
    .eq('business_id', businessId)
  if (decisionError) throw new Error('CURRENT_DECISION_UNAVAILABLE')
  const history = rows(decisions)
  const superseded = new Set(history.map((decision) => decision.supersedes_decision_id).filter(Boolean))
  const current = history.filter((decision) => !superseded.has(decision.id))
  if (current.length !== 1) throw new Error('CURRENT_DECISION_UNAVAILABLE')

  // Phase 1A intentionally stops here. Merely reading the tenant-scoped current
  // state proves the durable conveyor belt without changing canonical truth.
  return { recordId: record.id as string, currentDecisionId: current[0].id as string }
}

export async function drainBookkeepingProcessingJobs(input: {
  batchSize?: number
  admin?: SupabaseClient
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
  let completed = 0
  let retried = 0
  for (const job of claimed) {
    const jobId = String(job.id ?? '')
    try {
      await inspectCanonicalRecord(admin, job)
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
