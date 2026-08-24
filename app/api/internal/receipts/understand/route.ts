import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServerAdminSupabase } from '../../../../../utils/supabase/admin'
import { drainReceiptUnderstandingJobs, MAX_RECEIPT_UNDERSTANDING_BATCH } from '../../../../lib/receipts/receipt-understanding'

export const runtime = 'nodejs'

function authorized(request: Request) {
  const secret = process.env.BOOKKEEPING_WORKER_SECRET
  const provided = request.headers.get('authorization')
  if (!secret || !provided?.startsWith('Bearer ')) return false
  const expected = Buffer.from(secret); const actual = Buffer.from(provided.slice(7))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })
  let batchSize = 5
  try {
    const body = await request.json() as { batch_size?: unknown }
    if (typeof body.batch_size === 'number' && Number.isFinite(body.batch_size))
      batchSize = Math.max(1, Math.min(MAX_RECEIPT_UNDERSTANDING_BATCH, Math.trunc(body.batch_size)))
  } catch { /* bounded default */ }
  try { return NextResponse.json(await drainReceiptUnderstandingJobs({ batchSize })) }
  catch { return NextResponse.json({ error: 'Receipt understanding is temporarily unavailable.' }, { status: 503 }) }
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })
  const requested = Number(new URL(request.url).searchParams.get('limit') ?? 25)
  const limit = Math.max(1, Math.min(100, Number.isFinite(requested) ? Math.trunc(requested) : 25))
  const admin = createServerAdminSupabase()
  const { data, error } = await admin.from('receipt_understanding_evaluations').select(
    'id,receipt_id,document_sha256,provider,model,processor_version,prompt_version,output_schema_version,structured_proposal,validation_status,validation_codes,semantic_outcome,provider_request_id,input_tokens,output_tokens,total_tokens,page_count,processed_page_count,duration_ms,provider_error_code,write_enabled,created_at',
  ).order('created_at', { ascending: false }).limit(limit)
  if (error) return NextResponse.json({ error: 'Receipt results are temporarily unavailable.' }, { status: 503 })
  const receiptIds = [...new Set((data ?? []).map((row) => row.receipt_id))]
  const { data: parserRows } = receiptIds.length === 0 ? { data: [] } : await admin
    .from('bookkeeping_receipt_extractions')
    .select('receipt_id,provider,merchant,occurred_on,total_amount_cents,quality_status,quality_reasons,created_at')
    .in('receipt_id', receiptIds).in('provider', ['google_vision', 'filename'])
    .order('created_at', { ascending: false })
  const currentParser = new Map<string, Record<string, unknown>>()
  for (const row of parserRows ?? []) if (!currentParser.has(row.receipt_id)) currentParser.set(row.receipt_id, row)
  return NextResponse.json({ evaluations: (data ?? []).map((row) => ({
    ...row, current_parser: currentParser.get(row.receipt_id) ?? null,
  })) })
}
