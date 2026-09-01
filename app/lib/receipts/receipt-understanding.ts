import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerAdminSupabase } from '../../../utils/supabase/admin'
import {
  configuredReceiptUnderstandingGateway, type ReceiptUnderstandingGateway,
} from './receipt-understanding-gateway'
import {
  RECEIPT_UNDERSTANDING_PROCESSOR_VERSION, RECEIPT_UNDERSTANDING_PROMPT_VERSION,
  RECEIPT_UNDERSTANDING_SCHEMA_VERSION, validateReceiptUnderstandingProposal,
  type ReceiptUnderstandingProposal,
} from './receipt-understanding-types'

type Row = Record<string, unknown>
export const MAX_RECEIPT_UNDERSTANDING_BATCH = 10

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : value ? [value as Row] : []
const safeProviderError = (error: unknown) => {
  const message = error instanceof Error ? error.message : ''
  return /^RECEIPT_AI_(PROVIDER|RESPONSE)_[A-Z0-9_]+$/.test(message)
    ? message : 'RECEIPT_AI_PROVIDER_FAILED'
}

async function comparisonCodes(admin: SupabaseClient, businessId: string, receiptId: string,
  proposal: ReceiptUnderstandingProposal | null) {
  if (!proposal) return []
  const { data } = await admin.from('bookkeeping_receipt_extractions')
    .select('provider,merchant,occurred_on,total_amount_cents').eq('business_id', businessId)
    .eq('receipt_id', receiptId).in('provider', ['google_vision', 'filename'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!data) return []
  const codes: string[] = []
  if (proposal.merchant && data.merchant && proposal.merchant.value.trim().toLowerCase() === String(data.merchant).trim().toLowerCase()) codes.push('OCR_MERCHANT_AGREES')
  if (proposal.purchaseDate?.value === data.occurred_on) codes.push('OCR_DATE_AGREES')
  if (proposal.total?.cents === Number(data.total_amount_cents)) codes.push('OCR_TOTAL_AGREES')
  return codes
}

async function persistProviderError(input: {
  admin: SupabaseClient; job: Row; gateway: ReceiptUnderstandingGateway; errorCode: string
  durationMs: number; pageCount: number; processedPageCount: number
}) {
  const { error } = await input.admin.from('receipt_understanding_evaluations').insert({
    business_id: input.job.business_id, receipt_id: input.job.receipt_id, job_id: input.job.id,
    document_sha256: input.job.document_sha256, provider: input.gateway.provider, model: input.gateway.model,
    processor_version: RECEIPT_UNDERSTANDING_PROCESSOR_VERSION,
    prompt_version: RECEIPT_UNDERSTANDING_PROMPT_VERSION,
    output_schema_version: RECEIPT_UNDERSTANDING_SCHEMA_VERSION,
    validation_status: 'provider_error', validation_codes: [], page_count: input.pageCount,
    processed_page_count: input.processedPageCount, duration_ms: input.durationMs,
    provider_error_code: input.errorCode, write_enabled: false,
  })
  if (error) throw new Error('RECEIPT_UNDERSTANDING_AUDIT_WRITE_FAILED')
}

export async function evaluateReceiptUnderstandingJob(input: {
  admin: SupabaseClient; job: Row; gateway?: ReceiptUnderstandingGateway | null
}) {
  const gateway = input.gateway === undefined ? configuredReceiptUnderstandingGateway() : input.gateway
  if (!gateway) return { outcome: 'disabled' as const }
  const businessId = String(input.job.business_id ?? ''); const receiptId = String(input.job.receipt_id ?? '')
  const documentSha256 = String(input.job.document_sha256 ?? '')
  const { data: receipt, error } = await input.admin.from('receipts')
    .select('id,business_id,upload_fingerprint,storage_path,mime_type,original_name')
    .eq('id', receiptId).eq('business_id', businessId).single()
  if (error || !receipt) throw new Error('RECEIPT_AI_RECEIPT_UNAVAILABLE')
  if (receipt.upload_fingerprint !== documentSha256) return { outcome: 'stale' as const }
  const { data: prior } = await input.admin.from('receipt_understanding_evaluations').select('id')
    .eq('business_id', businessId).eq('receipt_id', receiptId).eq('document_sha256', documentSha256)
    .eq('provider', gateway.provider).eq('model', gateway.model)
    .eq('processor_version', RECEIPT_UNDERSTANDING_PROCESSOR_VERSION)
    .eq('prompt_version', RECEIPT_UNDERSTANDING_PROMPT_VERSION)
    .eq('output_schema_version', RECEIPT_UNDERSTANDING_SCHEMA_VERSION)
    .in('validation_status', ['accepted', 'rejected']).limit(1)
  if (prior?.length) return { outcome: 'cached' as const }

  const { data: blob, error: storageError } = await input.admin.storage.from('receipts').download(receipt.storage_path)
  if (storageError || !blob) throw new Error('RECEIPT_AI_DOCUMENT_UNAVAILABLE')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const actualHash = createHash('sha256').update(bytes).digest('hex')
  if (actualHash !== documentSha256) return { outcome: 'stale' as const }
  const { count: customerCorrectionCount } = await input.admin.from('bookkeeping_receipt_extractions')
    .select('*', { count: 'exact', head: true }).eq('business_id', businessId).eq('receipt_id', receiptId)
    .eq('provider', 'customer')

  const started = Date.now(); const correlationId = randomUUID()
  let result
  try {
    result = await gateway.understand({ correlationId, document: { bytes,
      mimeType: receipt.mime_type, originalName: receipt.original_name ?? 'receipt' } })
  } catch (providerError) {
    const errorCode = safeProviderError(providerError)
    await persistProviderError({ admin: input.admin, job: input.job, gateway, errorCode,
      durationMs: Date.now() - started, pageCount: 1, processedPageCount: 1 })
    throw new Error(errorCode)
  }
  const validation = validateReceiptUnderstandingProposal({ output: result.output,
    processedPages: result.processedPageCount, fingerprintCurrent: receipt.upload_fingerprint === actualHash,
    customerCorrectionCurrent: Number(customerCorrectionCount ?? 0) > 0 })
  const comparisons = await comparisonCodes(input.admin, businessId, receiptId, validation.proposal)
  const validationCodes = [...validation.codes, ...comparisons]
  const proposal = validation.proposal ?? { documentType: 'unknown', outcome: 'not_recognized',
    merchant: null, purchaseDate: null, total: null, ambiguityCodes: [], documentSignals: [] }
  const serialized = JSON.stringify(proposal)
  if (serialized.length > 12_000) {
    validation.accepted = false; validationCodes.push('PROPOSAL_TOO_LARGE')
  }
  const { error: auditError } = await input.admin.from('receipt_understanding_evaluations').insert({
    business_id: businessId, receipt_id: receiptId, job_id: input.job.id,
    document_sha256: actualHash, provider: gateway.provider, model: gateway.model,
    processor_version: RECEIPT_UNDERSTANDING_PROCESSOR_VERSION,
    prompt_version: RECEIPT_UNDERSTANDING_PROMPT_VERSION,
    output_schema_version: RECEIPT_UNDERSTANDING_SCHEMA_VERSION,
    structured_proposal: proposal, validation_status: validation.accepted ? 'accepted' : 'rejected',
    validation_codes: validationCodes, semantic_outcome: proposal.outcome,
    provider_request_id: result.providerRequestId, input_tokens: result.inputTokens,
    output_tokens: result.outputTokens, total_tokens: result.totalTokens,
    page_count: result.pageCount, processed_page_count: result.processedPageCount,
    duration_ms: Date.now() - started, write_enabled: false,
  })
  if (auditError?.code === '23505') return { outcome: 'cached' as const }
  if (auditError) throw new Error('RECEIPT_UNDERSTANDING_AUDIT_WRITE_FAILED')
  if (validation.accepted && proposal.mealCandidate) {
    const { error: candidateError } = await input.admin.rpc('worker_record_receipt_meal_candidate', {
      p_business_id: businessId, p_receipt_id: receiptId, p_document_sha256: actualHash,
      p_support_kind: proposal.mealCandidate.support, p_evidence: proposal.mealCandidate.evidence,
      p_processor_version: RECEIPT_UNDERSTANDING_PROCESSOR_VERSION,
    })
    if (candidateError) throw new Error('RECEIPT_MEAL_CANDIDATE_WRITE_FAILED')
  }
  return { outcome: validation.accepted ? 'accepted_shadow' as const : 'rejected_shadow' as const,
    semanticOutcome: proposal.outcome, validationCodes }
}

export async function drainReceiptUnderstandingJobs(input: {
  batchSize?: number; admin?: SupabaseClient; gateway?: ReceiptUnderstandingGateway | null
} = {}) {
  const admin = input.admin ?? createServerAdminSupabase()
  const gateway = input.gateway === undefined ? configuredReceiptUnderstandingGateway() : input.gateway
  if (!gateway) return { claimed: 0, completed: 0, retried: 0, disabled: true }
  const batchSize = Math.max(1, Math.min(MAX_RECEIPT_UNDERSTANDING_BATCH, Math.trunc(input.batchSize ?? 5)))
  const leaseId = randomUUID()
  const { data, error } = await admin.rpc('claim_receipt_processing_jobs', {
    p_lease_id: leaseId, p_limit: batchSize, p_lease_seconds: 120,
  })
  if (error) throw new Error(`RECEIPT_PROCESSING_CLAIM_FAILED:${error.message}`)
  const claimed = rows(data); let completed = 0; let retried = 0
  for (const job of claimed) {
    try {
      await evaluateReceiptUnderstandingJob({ admin, job, gateway })
      const { data: didComplete, error: completeError } = await admin.rpc('complete_receipt_processing_job', {
        p_job_id: job.id, p_lease_id: leaseId,
      })
      if (completeError || didComplete !== true) throw new Error('RECEIPT_PROCESSING_LEASE_LOST')
      completed += 1
    } catch (processingError) {
      const errorCode = safeProviderError(processingError)
      const { error: retryError } = await admin.rpc('retry_receipt_processing_job', {
        p_job_id: job.id, p_lease_id: leaseId, p_error_code: errorCode,
      })
      if (!retryError) retried += 1
    }
  }
  return { claimed: claimed.length, completed, retried }
}
