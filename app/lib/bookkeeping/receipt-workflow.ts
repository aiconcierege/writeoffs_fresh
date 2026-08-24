import type { SupabaseClient } from '@supabase/supabase-js'

export type ReceiptLifecycleState = 'uploaded' | 'extraction_completed' | 'matched' | 'unmatched' | 'retained' | 'kept' | 'discarded'
export type ReceiptDisplayStatus = 'processing' | 'matched' | 'receipt_only' | 'details_unavailable' | 'discarded'

export type ReceiptReadItem = {
  id: string
  originalName: string
  mimeType: string
  bytes: number
  createdAt: string
  signedUrl: string | null
  state: ReceiptLifecycleState | 'legacy'
  merchant: string | null
  occurredOn: string | null
  totalAmountCents: number | null
  recordId: string | null
  displayStatus: ReceiptDisplayStatus
  qualityStatus: 'usable' | 'incomplete' | 'suspect' | null
  qualityReasons: string[]
}

export async function requireReceiptOwner(supabase: SupabaseClient) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('An authenticated user is required.')
  const { data: business, error: businessError } = await supabase.from('businesses')
    .select('id').eq('owner_user_id', user.id).single()
  if (businessError || !business) throw new Error('Business was not found for the authenticated user.')
  return { user, businessId: business.id as string }
}

export async function listCanonicalReceipts(input: { supabase: SupabaseClient; limit?: number }) {
  const { user, businessId } = await requireReceiptOwner(input.supabase)
  const { data: receipts, error } = await input.supabase.from('receipts')
    .select('id,storage_path,original_name,mime_type,bytes,created_at,business_id')
    .eq('user_id', user.id).order('created_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 100))
  if (error) throw new Error('Receipts could not be loaded.')
  const canonical = receipts.filter((receipt) => receipt.business_id === businessId)
  const ids = canonical.map((receipt) => receipt.id)
  const [eventResult, extractionResult, convergenceResult] = ids.length ? await Promise.all([
    input.supabase.from('bookkeeping_receipt_events').select('*').eq('business_id', businessId)
      .in('receipt_id', ids).order('sequence_number', { ascending: false }),
    input.supabase.from('bookkeeping_receipt_extractions').select('*').eq('business_id', businessId)
      .in('receipt_id', ids).order('created_at', { ascending: false }),
    input.supabase.from('current_bookkeeping_record_convergences')
      .select('receipt_id').eq('business_id', businessId).in('receipt_id', ids),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }]
  if (eventResult.error || extractionResult.error || convergenceResult.error) throw new Error('Receipt history could not be loaded.')
  const currentByReceipt = new Map<string, Record<string, unknown>>()
  for (const event of eventResult.data ?? []) if (!currentByReceipt.has(event.receipt_id)) currentByReceipt.set(event.receipt_id, event)
  const extractionByReceipt = new Map<string, Record<string, unknown>>()
  for (const extraction of extractionResult.data ?? []) if (!extractionByReceipt.has(extraction.receipt_id)) extractionByReceipt.set(extraction.receipt_id, extraction)
  const convergedReceipts = new Set((convergenceResult.data ?? []).map((row) => row.receipt_id))
  return Promise.all(canonical.map(async (receipt): Promise<ReceiptReadItem> => {
    const event = currentByReceipt.get(receipt.id)
    const extraction = extractionByReceipt.get(receipt.id)
    const { data: signed } = await input.supabase.storage.from('receipts').createSignedUrl(receipt.storage_path, 120)
    return {
      id: receipt.id,
      originalName: receipt.original_name ?? 'Receipt',
      mimeType: receipt.mime_type,
      bytes: receipt.bytes,
      createdAt: receipt.created_at,
      signedUrl: signed?.signedUrl ?? null,
      state: (event?.event_type as ReceiptLifecycleState | undefined) ?? 'legacy',
      merchant: (extraction?.merchant as string | null | undefined) ?? null,
      occurredOn: (extraction?.occurred_on as string | null | undefined) ?? null,
      totalAmountCents: extraction?.total_amount_cents == null ? null : Number(extraction.total_amount_cents),
      recordId: (event?.bookkeeping_record_id as string | null | undefined) ?? null,
      displayStatus: receiptDisplayStatus({ eventType: event?.event_type as string | undefined,
        converged: convergedReceipts.has(receipt.id), qualityStatus: extraction?.quality_status as string | undefined }),
      qualityStatus: (extraction?.quality_status as ReceiptReadItem['qualityStatus'] | undefined) ?? null,
      qualityReasons: Array.isArray(extraction?.quality_reasons)
        ? extraction.quality_reasons.filter((reason): reason is string => typeof reason === 'string') : [],
    }
  }))
}

export async function countReceiptsNeedingAttention(supabase: SupabaseClient) {
  const { businessId } = await requireReceiptOwner(supabase)
  const { data, error } = await supabase.from('bookkeeping_receipt_events')
    .select('id,receipt_id,supersedes_event_id,event_type').eq('business_id', businessId)
  if (error) throw new Error('Receipt attention could not be loaded.')
  const superseded = new Set((data ?? []).map((event) => event.supersedes_event_id).filter(Boolean))
  return (data ?? []).filter((event) => !superseded.has(event.id) && event.event_type === 'unmatched').length
}

function receiptDisplayStatus(input: { eventType?: string; converged: boolean; qualityStatus?: string }): ReceiptDisplayStatus {
  if (input.eventType === 'discarded') return 'discarded'
  if (input.eventType === 'matched' || input.converged) return 'matched'
  if (input.eventType === 'retained' || input.eventType === 'kept') return 'receipt_only'
  if (input.eventType === 'extraction_completed'
    && (input.qualityStatus === 'incomplete' || input.qualityStatus === 'suspect')) return 'details_unavailable'
  return 'processing'
}

export async function registerReceipt(input: {
  supabase: SupabaseClient
  id: string
  uploadFingerprint: string
  storagePath: string
  originalName: string
  mimeType: string
  bytes: number
}) {
  const { data, error } = await input.supabase.rpc('register_bookkeeping_receipt', {
    p_receipt_id: input.id,
    p_upload_fingerprint: input.uploadFingerprint,
    p_storage_path: input.storagePath,
    p_original_name: input.originalName,
    p_mime_type: input.mimeType,
    p_bytes: input.bytes,
  })
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? data[0] : data
}

export async function recordReceiptExtraction(input: {
  supabase: SupabaseClient
  receiptId: string
  extractionKey: string
  provider: string
  merchant: string | null
  occurredOn: string | null
  totalAmountCents: number | null
  rawPayload?: Record<string, unknown> | null
}) {
  const { data, error } = await input.supabase.rpc('record_bookkeeping_receipt_extraction', {
    p_receipt_id: input.receiptId,
    p_extraction_key: input.extractionKey,
    p_provider: input.provider,
    p_merchant: input.merchant,
    p_occurred_on: input.occurredOn,
    p_total_amount_cents: input.totalAmountCents,
    p_raw_payload: input.rawPayload ?? null,
  })
  if (error) throw new Error(error.message)
  return data as { receipt_id: string; state: string; record_id?: string }
}

export async function completeUnmatchedReceipt(input: {
  supabase: SupabaseClient
  receiptId: string
  action: 'keep' | 'discard'
}) {
  const name = input.action === 'keep'
    ? 'keep_unmatched_bookkeeping_receipt'
    : 'discard_unmatched_bookkeeping_receipt'
  const { data, error } = await input.supabase.rpc(name, { p_receipt_id: input.receiptId })
  if (error) throw new Error(error.message)
  return data
}
