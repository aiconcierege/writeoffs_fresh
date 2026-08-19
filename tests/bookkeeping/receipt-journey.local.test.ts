import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'
import { listTransactionReadModel } from '../../app/lib/bookkeeping/transaction-read-model'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const suite = enabled ? describe : describe.skip

suite('canonical receipt journey against local PostgreSQL', () => {
  let admin: ReturnType<typeof createClient>
  let a: Awaited<ReturnType<typeof provisionLocalCanonicalOwner>>
  let b: Awaited<ReturnType<typeof provisionLocalCanonicalOwner>>

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    a = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label: 'receipt-a', amounts: [-1299] })
    b = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label: 'receipt-b', amounts: [-1299] })
  })

  async function register(client = a.customer, userId = a.userId, fingerprint = crypto.randomUUID().replaceAll('-', '').padEnd(64, 'a').slice(0, 64)) {
    const id = crypto.randomUUID()
    const { data, error } = await client.rpc('register_bookkeeping_receipt', {
      p_receipt_id: id, p_upload_fingerprint: fingerprint,
      p_storage_path: `receipts/${userId}/${fingerprint}`,
      p_original_name: 'receipt.pdf', p_mime_type: 'application/pdf', p_bytes: 42,
    })
    if (error) throw error
    return { id: (Array.isArray(data) ? data[0] : data).id as string, fingerprint }
  }

  it('registers idempotently and isolates Businesses', async () => {
    const fingerprint = 'a'.repeat(64)
    const first = await register(a.customer, a.userId, fingerprint)
    const second = await register(a.customer, a.userId, fingerprint)
    expect(second.id).toBe(first.id)
    const { data: hidden } = await b.customer.from('receipts').select('id').eq('id', first.id)
    expect(hidden).toEqual([])
    const { error } = await b.customer.rpc('discard_unmatched_bookkeeping_receipt', { p_receipt_id: first.id })
    expect(error).toBeTruthy()
    const anonymous = createClient(url!, anonKey!, { auth: { persistSession: false } })
    const { error: anonymousError } = await anonymous.rpc('register_bookkeeping_receipt', {
      p_receipt_id: crypto.randomUUID(), p_upload_fingerprint: 'b'.repeat(64),
      p_storage_path: `receipts/${a.userId}/${'b'.repeat(64)}`,
      p_original_name: 'x.pdf', p_mime_type: 'application/pdf', p_bytes: 10,
    })
    expect(anonymousError).toBeTruthy()
    const { error: directInsertError } = await a.customer.from('receipts').insert({
      user_id: a.userId, storage_path: `receipts/${a.userId}/bypass`, mime_type: 'application/pdf', bytes: 10,
    })
    expect(directInsertError).toBeTruthy()
    const { error: legacyAuthorityError } = await a.customer.from('receipts')
      .update({ transaction_id: crypto.randomUUID() }).eq('id', first.id)
    expect(legacyAuthorityError).toBeTruthy()
  })

  it('keeps one unmatched receipt as one receipt-only unresolved record on retries', async () => {
    const receipt = await register()
    const { error: extractionError } = await a.customer.rpc('record_bookkeeping_receipt_extraction', {
      p_receipt_id: receipt.id, p_extraction_key: 'customer:v1', p_provider: 'customer',
      p_merchant: 'Corner Supply', p_occurred_on: '2026-07-03', p_total_amount_cents: 4321, p_raw_payload: null,
    })
    expect(extractionError).toBeNull()
    const results = await Promise.allSettled(Array.from({ length: 2 }, () =>
      a.customer.rpc('keep_unmatched_bookkeeping_receipt', { p_receipt_id: receipt.id })))
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true)
    const { data: records } = await a.customer.from('bookkeeping_records').select('id,source_kind,amount_cents,occurred_on')
      .eq('business_id', a.businessId).eq('source_kind', 'receipt').eq('ingestion_key', `receipt:${receipt.id}`)
    expect(records).toEqual([expect.objectContaining({ source_kind: 'receipt', amount_cents: -4321, occurred_on: '2026-07-03' })])
    const { count: financialCount } = await a.customer.from('bookkeeping_financial_sources')
      .select('*', { count: 'exact', head: true }).eq('bookkeeping_record_id', records![0].id)
    expect(financialCount).toBe(0)
    const { data: events } = await a.customer.from('bookkeeping_receipt_events').select('event_type').eq('receipt_id', receipt.id)
    expect(events?.map((event) => event.event_type)).toEqual(['uploaded', 'extraction_completed', 'kept'])
    const readRows = await listTransactionReadModel({ supabase: a.customer, userId: a.userId })
    expect(readRows).toContainEqual(expect.objectContaining({ id: records![0].id,
      vendor: 'Corner Supply', amountCents: -4321, sourceLabel: 'Receipt only', has_receipt: true }))
  })

  it('discards idempotently without creating bookkeeping activity', async () => {
    const receipt = await register()
    await a.customer.rpc('discard_unmatched_bookkeeping_receipt', { p_receipt_id: receipt.id })
    await a.customer.rpc('discard_unmatched_bookkeeping_receipt', { p_receipt_id: receipt.id })
    const { data: events } = await a.customer.from('bookkeeping_receipt_events').select('event_type').eq('receipt_id', receipt.id)
    expect(events?.map((event) => event.event_type)).toEqual(['uploaded', 'discarded'])
    const { count } = await a.customer.from('bookkeeping_records').select('*', { count: 'exact', head: true })
      .eq('business_id', a.businessId).eq('ingestion_key', `receipt:${receipt.id}`)
    expect(count).toBe(0)
  })

  it('auto-matches only an exact unique canonical candidate and never writes legacy receipt authority', async () => {
    const receipt = await register()
    const { data: transaction } = await a.customer.from('financial_transactions')
      .select('transaction_date,merchant_name,amount_cents').eq('id', a.transactionIds[0]).single()
    const { data, error } = await a.customer.rpc('record_bookkeeping_receipt_extraction', {
      p_receipt_id: receipt.id, p_extraction_key: 'vision:v1', p_provider: 'google_vision',
      p_merchant: transaction!.merchant_name, p_occurred_on: transaction!.transaction_date,
      p_total_amount_cents: Math.abs(transaction!.amount_cents), p_raw_payload: null,
    })
    expect(error).toBeNull()
    expect(data.state).toBe('matched')
    const { data: stored } = await a.customer.from('receipts').select('transaction_id').eq('id', receipt.id).single()
    expect(stored?.transaction_id).toBeNull()
    const { count } = await a.customer.from('bookkeeping_document_links').select('*', { count: 'exact', head: true }).eq('receipt_id', receipt.id)
    expect(count).toBe(1)
  })

  it('rejects mutation of append-only history', async () => {
    const receipt = await register()
    const { data: event } = await a.customer.from('bookkeeping_receipt_events').select('id').eq('receipt_id', receipt.id).single()
    const { error } = await admin.from('bookkeeping_receipt_events').update({ context: { changed: true } } as never).eq('id', event!.id)
    expect(error?.message).toContain('append-only')
  })

  it('preserves match, revocation, and rematch history atomically', async () => {
    const receipt = await register()
    const { data: source } = await a.customer.from('bookkeeping_financial_sources')
      .select('bookkeeping_record_id').eq('financial_transaction_id', a.transactionIds[0]).single()
    const first = await a.customer.rpc('attach_bookkeeping_receipt_journey', {
      p_bookkeeping_record_id: source!.bookkeeping_record_id, p_receipt_id: receipt.id,
    })
    expect(first.error).toBeNull()
    const link = Array.isArray(first.data) ? first.data[0] : first.data
    const revoked = await a.customer.rpc('revoke_bookkeeping_receipt_journey', {
      p_document_link_id: link.id, p_reason: 'Customer selected a different receipt.',
    })
    expect(revoked.error).toBeNull()
    const rematched = await a.customer.rpc('attach_bookkeeping_receipt_journey', {
      p_bookkeeping_record_id: source!.bookkeeping_record_id, p_receipt_id: receipt.id,
    })
    expect(rematched.error).toBeNull()
    const { data: events } = await a.customer.from('bookkeeping_receipt_events')
      .select('event_type').eq('receipt_id', receipt.id).order('sequence_number')
    expect(events?.map((event) => event.event_type)).toEqual(['uploaded', 'matched', 'unmatched', 'matched'])
  })
})
