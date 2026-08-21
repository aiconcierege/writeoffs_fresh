import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServerAdminSupabase } from '../../../../../utils/supabase/admin'

export const runtime = 'nodejs'

function authorized(request: Request) {
  const secret = process.env.BOOKKEEPING_WORKER_SECRET
  const provided = request.headers.get('authorization')
  if (!secret || !provided?.startsWith('Bearer ')) return false
  const candidate = Buffer.from(provided.slice('Bearer '.length))
  const expected = Buffer.from(secret)
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })
  }
  const requested = Number(new URL(request.url).searchParams.get('limit') ?? 50)
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(100, Math.trunc(requested))) : 50
  const admin = createServerAdminSupabase()
  const { data: evaluations, error } = await admin.from('bookkeeping_ai_shadow_evaluations')
    .select('id,business_id,bookkeeping_record_id,created_at,provider,model,model_outcome,structured_proposal,referenced_evidence_ids,validation_status,validation_codes,question_eligible,duration_ms,input_tokens,output_tokens,total_tokens,provider_request_id,provider_error_code')
    .order('created_at', { ascending: false }).limit(limit)
  if (error) {
    return NextResponse.json({ error: 'Shadow evaluations are temporarily unavailable.' }, { status: 503 })
  }
  const recordIds = (evaluations ?? []).map((evaluation) => evaluation.bookkeeping_record_id)
  const { data: records } = recordIds.length
    ? await admin.from('bookkeeping_records').select('id,business_id,amount_cents,currency,occurred_on')
      .in('id', recordIds)
    : { data: [] }
  const { data: links } = recordIds.length
    ? await admin.from('bookkeeping_financial_sources')
      .select('business_id,bookkeeping_record_id,financial_transaction_id')
      .in('bookkeeping_record_id', recordIds).is('revoked_at', null)
    : { data: [] }
  const transactionIds = (links ?? []).map((link) => link.financial_transaction_id)
  const { data: transactions } = transactionIds.length
    ? await admin.from('financial_transactions')
      .select('id,business_id,merchant_name,original_description')
      .in('id', transactionIds)
    : { data: [] }
  const recordById = new Map((records ?? []).map((record) => [record.id, record]))
  const transactionById = new Map((transactions ?? []).map((transaction) => [transaction.id, transaction]))
  const linkByRecord = new Map((links ?? []).map((link) => [link.bookkeeping_record_id, link]))
  return NextResponse.json({
    evaluations: (evaluations ?? []).map((evaluation) => {
      const record = recordById.get(evaluation.bookkeeping_record_id)
      const link = linkByRecord.get(evaluation.bookkeeping_record_id)
      const transaction = link ? transactionById.get(link.financial_transaction_id) : null
      const tenantMatches = record?.business_id === evaluation.business_id
        && (!link || link.business_id === evaluation.business_id)
        && (!transaction || transaction.business_id === evaluation.business_id)
      return {
        id: evaluation.id,
        created_at: evaluation.created_at,
        merchant: tenantMatches
          ? transaction?.merchant_name || transaction?.original_description || 'Receipt-only activity'
          : 'Unavailable',
        amount_cents: tenantMatches ? record?.amount_cents ?? null : null,
        currency: tenantMatches ? record?.currency ?? null : null,
        economic_date: tenantMatches ? record?.occurred_on ?? null : null,
        provider: evaluation.provider,
        model: evaluation.model,
        outcome: evaluation.model_outcome,
        proposal: evaluation.structured_proposal,
        evidence_references: evaluation.referenced_evidence_ids,
        validation: evaluation.validation_status,
        rejection_codes: evaluation.validation_codes,
        question_eligible: evaluation.question_eligible,
        duration_ms: evaluation.duration_ms,
        token_usage: {
          input: evaluation.input_tokens,
          output: evaluation.output_tokens,
          total: evaluation.total_tokens,
        },
        provider_error_code: evaluation.provider_error_code,
        provider_request_id: evaluation.provider_request_id,
      }
    }),
  })
}
