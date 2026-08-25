import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { MockReceiptUnderstandingGateway } from '../../app/lib/receipts/receipt-understanding-gateway'
import { drainReceiptUnderstandingJobs } from '../../app/lib/receipts/receipt-understanding'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const suite = enabled ? describe.sequential : describe.skip

suite('receipt understanding shadow queue against local PostgreSQL', () => {
  async function receiptFixture(label: string) {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label, amounts: [-1234],
    })
    const bytes = new TextEncoder().encode(`synthetic receipt bytes ${label}`)
    const fingerprint = createHash('sha256').update(bytes).digest('hex')
    const storagePath = `receipts/${owner.userId}/${fingerprint}`
    const upload = await admin.storage.from('receipts').upload(storagePath, bytes, {
      contentType: 'image/png', upsert: false,
    })
    if (upload.error) throw upload.error
    const receiptId = randomUUID()
    const registration = await owner.customer.rpc('register_bookkeeping_receipt', {
      p_receipt_id: receiptId, p_upload_fingerprint: fingerprint, p_storage_path: storagePath,
      p_original_name: `${label}.png`, p_mime_type: 'image/png', p_bytes: bytes.length,
    })
    if (registration.error) throw registration.error
    const receipt = Array.isArray(registration.data) ? registration.data[0] : registration.data
    return { admin, owner, receiptId: receipt.id as string, fingerprint }
  }

  it('enqueues idempotently, claims exclusively, and enforces lease ownership', async () => {
    const fixture = await receiptFixture('receipt-ai-queue')
    const { data: jobs } = await fixture.admin.from('receipt_processing_jobs')
      .select('*').eq('receipt_id', fixture.receiptId).eq('job_type', 'receipt_understanding_shadow')
    expect(jobs).toHaveLength(1)
    expect(jobs?.[0]).toMatchObject({ state: 'pending', attempt_count: 0, business_id: fixture.owner.businessId })
    const enqueueArgs = {
      p_business_id: fixture.owner.businessId, p_receipt_id: fixture.receiptId,
      p_reason: 'duplicate_test', p_document_sha256: fixture.fingerprint,
      p_processor_version: 'receipt-understanding:r1.1', p_provider: 'openai',
      p_model: 'environment-configured', p_prompt_version: 'receipt-understanding-prompt:v1',
      p_output_schema_version: 'receipt-understanding-schema:v1',
    }
    const firstRequest = await fixture.admin.rpc('request_receipt_understanding_processing', enqueueArgs)
    const secondRequest = await fixture.admin.rpc('request_receipt_understanding_processing', enqueueArgs)
    expect(firstRequest.error ?? secondRequest.error).toBeNull()
    expect(secondRequest.data).toBe(firstRequest.data)

    const leaseOne = randomUUID(); const leaseTwo = randomUUID()
    const [first, second] = await Promise.all([
      fixture.admin.rpc('claim_receipt_processing_jobs', { p_lease_id: leaseOne, p_limit: 10, p_lease_seconds: 60 }),
      fixture.admin.rpc('claim_receipt_processing_jobs', { p_lease_id: leaseTwo, p_limit: 10, p_lease_seconds: 60 }),
    ])
    expect(first.error ?? second.error).toBeNull()
    const all = [...(first.data ?? []), ...(second.data ?? [])]
    expect(all.filter((job: { id: string }) => job.id === firstRequest.data)).toHaveLength(1)
    const owningLease = (first.data ?? []).some((job: { id: string }) => job.id === firstRequest.data)
      ? leaseOne : leaseTwo
    const wrongLease = owningLease === leaseOne ? leaseTwo : leaseOne
    const wrongCompletion = await fixture.admin.rpc('complete_receipt_processing_job', {
      p_job_id: firstRequest.data, p_lease_id: wrongLease,
    })
    expect(wrongCompletion).toMatchObject({ data: false, error: null })
    const retry = await fixture.admin.rpc('retry_receipt_processing_job', {
      p_job_id: firstRequest.data, p_lease_id: owningLease, p_error_code: 'TEST_PROVIDER_TIMEOUT',
    })
    expect(retry).toMatchObject({ data: 'retryable', error: null })
    await fixture.admin.from('receipt_processing_jobs').update({ available_at: new Date(0).toISOString() })
      .eq('id', firstRequest.data)
    const expiringLease = randomUUID()
    const reclaimed = await fixture.admin.rpc('claim_receipt_processing_jobs', {
      p_lease_id: expiringLease, p_limit: 10, p_lease_seconds: 60,
    })
    expect(reclaimed.data).toContainEqual(expect.objectContaining({ id: firstRequest.data, attempt_count: 2 }))
    await fixture.admin.from('receipt_processing_jobs').update({
      lease_expires_at: new Date(0).toISOString(),
    }).eq('id', firstRequest.data)
    const recoveryLease = randomUUID()
    const recovered = await fixture.admin.rpc('claim_receipt_processing_jobs', {
      p_lease_id: recoveryLease, p_limit: 10, p_lease_seconds: 60,
    })
    expect(recovered.data).toContainEqual(expect.objectContaining({ id: firstRequest.data, attempt_count: 3 }))
    await fixture.admin.from('receipt_processing_jobs').update({
      attempt_count: 6, lease_expires_at: new Date(0).toISOString(),
    }).eq('id', firstRequest.data)
    await fixture.admin.rpc('claim_receipt_processing_jobs', {
      p_lease_id: randomUUID(), p_limit: 1, p_lease_seconds: 60,
    })
    const { data: deadLetter } = await fixture.admin.from('receipt_processing_jobs')
      .select('state,last_error_code').eq('id', firstRequest.data).single()
    expect(deadLetter).toEqual({ state: 'dead_letter', last_error_code: 'RETRY_LIMIT_EXCEEDED' })
    const customerRead = await fixture.owner.customer.from('receipt_processing_jobs').select('*')
    expect(customerRead.error).toBeTruthy()
    const customerClaim = await fixture.owner.customer.rpc('claim_receipt_processing_jobs', {
      p_lease_id: randomUUID(), p_limit: 1, p_lease_seconds: 60,
    })
    expect(customerClaim.error).toBeTruthy()
    const crossBusiness = await fixture.admin.rpc('request_receipt_understanding_processing', {
      ...enqueueArgs, p_business_id: randomUUID(),
    })
    expect(crossBusiness.error).toBeTruthy()
  })

  it('persists accepted shadow audit and leaves every canonical surface unchanged', async () => {
    const fixture = await receiptFixture('receipt-ai-shadow')
    const canonicalTables = ['bookkeeping_receipt_extractions', 'bookkeeping_records',
      'bookkeeping_decisions', 'bookkeeping_allocations', 'bookkeeping_review_events',
      'bookkeeping_tax_treatments'] as const
    const before = await Promise.all(canonicalTables.map(async (table) => {
      const { count } = await fixture.admin.from(table).select('*', { count: 'exact', head: true })
        .eq('business_id', fixture.owner.businessId)
      return count
    }))
    const gateway = new MockReceiptUnderstandingGateway({
      documentType: 'receipt', outcome: 'understood',
      merchant: { value: 'Receipt Match Test', support: 'prominent_header',
        evidence: { page: 1, region: 'header', visibleText: 'Receipt Match Test' } },
      purchaseDate: { value: '2025-05-20', support: 'explicit_label',
        evidence: { page: 1, region: 'body', visibleText: 'Date: 05/20/2025' } },
      total: { currency: 'USD', cents: 1234, support: 'labeled_total',
        evidence: { page: 1, region: 'summary', visibleText: 'Total: $12.34' } },
      ambiguityCodes: [], documentSignals: [
        'MERCHANT_HEADER_VISIBLE', 'PURCHASE_DATE_VISIBLE', 'TOTAL_LABEL_VISIBLE',
      ],
    })
    const result = await drainReceiptUnderstandingJobs({ admin: fixture.admin, gateway, batchSize: 10 })
    expect(result.completed).toBeGreaterThanOrEqual(1)
    const { data: audit } = await fixture.admin.from('receipt_understanding_evaluations')
      .select('*').eq('receipt_id', fixture.receiptId).single()
    expect(audit).toMatchObject({ validation_status: 'accepted', semantic_outcome: 'understood',
      write_enabled: false, processed_page_count: 1 })
    expect(audit?.structured_proposal).toMatchObject({ merchant: { value: 'Receipt Match Test' },
      total: { cents: 1234 } })
    const after = await Promise.all(canonicalTables.map(async (table) => {
      const { count } = await fixture.admin.from(table).select('*', { count: 'exact', head: true })
        .eq('business_id', fixture.owner.businessId)
      return count
    }))
    expect(after).toEqual(before)
    const customerAudit = await fixture.owner.customer.from('receipt_understanding_evaluations').select('*')
    expect(customerAudit.error).toBeTruthy()
    const mutation = await fixture.admin.from('receipt_understanding_evaluations')
      .update({ semantic_outcome: 'partial' }).eq('id', audit!.id)
    expect(mutation.error?.message).toMatch(/append-only|permission denied/)
  })

  it('audits provider failures safely and schedules bounded retry without canonical writes', async () => {
    const fixture = await receiptFixture('receipt-ai-provider-failure')
    const failingGateway = {
      provider: 'openai', model: 'mock-terra',
      understand: async () => { throw new Error('RECEIPT_AI_PROVIDER_TIMEOUT') },
    }
    const result = await drainReceiptUnderstandingJobs({
      admin: fixture.admin, gateway: failingGateway, batchSize: 10,
    })
    expect(result.retried).toBeGreaterThanOrEqual(1)
    const { data: audit } = await fixture.admin.from('receipt_understanding_evaluations')
      .select('validation_status,provider_error_code,structured_proposal,write_enabled')
      .eq('receipt_id', fixture.receiptId).single()
    expect(audit).toEqual({ validation_status: 'provider_error',
      provider_error_code: 'RECEIPT_AI_PROVIDER_TIMEOUT', structured_proposal: null, write_enabled: false })
    const { data: job } = await fixture.admin.from('receipt_processing_jobs')
      .select('state,attempt_count,last_error_code').eq('receipt_id', fixture.receiptId)
      .eq('job_type', 'receipt_understanding_shadow').single()
    expect(job).toEqual({ state: 'retryable', attempt_count: 1,
      last_error_code: 'RECEIPT_AI_PROVIDER_TIMEOUT' })
  })
})
