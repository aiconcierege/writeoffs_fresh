import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { drainBookkeepingProcessingJobs } from '../../app/lib/bookkeeping/processing'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const suite = enabled ? describe.sequential : describe.skip

suite('bookkeeping processing queue against local PostgreSQL', () => {
  it('queues canonical records and no-op processing leaves accounting truth unchanged', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label: 'processing-owner', amounts: [-4321],
    })
    const { data: record } = await admin.from('bookkeeping_records')
      .select('id').eq('business_id', owner.businessId).single()
    const { data: beforeDecisions } = await admin.from('bookkeeping_decisions')
      .select('*').eq('business_id', owner.businessId).eq('bookkeeping_record_id', record!.id)
    expect(beforeDecisions).toHaveLength(1)
    expect(beforeDecisions?.[0]).toMatchObject({ treatment: 'unresolved' })

    const { data: jobs } = await admin.from('bookkeeping_processing_jobs')
      .select('id,state,attempt_count').eq('business_id', owner.businessId)
    expect(jobs).toHaveLength(1)
    expect(jobs?.[0]).toMatchObject({ state: 'pending', attempt_count: 0 })
    const customerRead = await owner.customer.from('bookkeeping_processing_jobs').select('*')
    expect(customerRead.error).not.toBeNull()
    const customerClaim = await owner.customer.rpc('claim_bookkeeping_processing_jobs', {
      p_lease_id: crypto.randomUUID(), p_limit: 1, p_lease_seconds: 60,
    })
    expect(customerClaim.error).not.toBeNull()

    process.env.SUPABASE_URL = url
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey
    for (let index = 0; index < 10; index += 1) {
      const result = await drainBookkeepingProcessingJobs({ batchSize: 25, admin })
      if (result.claimed === 0) break
    }

    const { data: completed } = await admin.from('bookkeeping_processing_jobs')
      .select('state,attempt_count,completed_at').eq('id', jobs![0].id).single()
    expect(completed?.state).toBe('completed')
    expect(completed?.attempt_count).toBe(1)
    expect(completed?.completed_at).toBeTruthy()
    const { data: afterDecisions } = await admin.from('bookkeeping_decisions')
      .select('*').eq('business_id', owner.businessId).eq('bookkeeping_record_id', record!.id)
    expect(afterDecisions).toEqual(beforeDecisions)
    const { count: allocationCount } = await admin.from('bookkeeping_allocations')
      .select('*', { count: 'exact', head: true }).eq('business_id', owner.businessId)
    const { count: questionCount } = await admin.from('bookkeeping_review_events')
      .select('*', { count: 'exact', head: true }).eq('business_id', owner.businessId)
    const { count: taxCount } = await admin.from('bookkeeping_tax_treatments')
      .select('*', { count: 'exact', head: true }).eq('business_id', owner.businessId)
    expect({ allocationCount, questionCount, taxCount }).toEqual({
      allocationCount: 0, questionCount: 0, taxCount: 0,
    })

    await drainBookkeepingProcessingJobs({ batchSize: 25, admin })
    const { data: stillCompleted } = await admin.from('bookkeeping_processing_jobs')
      .select('state,attempt_count,completed_at').eq('id', jobs![0].id).single()
    expect(stillCompleted).toEqual(completed)
  })

  it('enforces lease ownership, retry, reclaim, concurrency, and dead-letter contracts', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label: 'processing-leases', amounts: [-1100, -1200],
    })
    const leaseOne = crypto.randomUUID()
    const leaseTwo = crypto.randomUUID()
    const [first, second] = await Promise.all([
      admin.rpc('claim_bookkeeping_processing_jobs', {
        p_lease_id: leaseOne, p_limit: 25, p_lease_seconds: 15,
      }),
      admin.rpc('claim_bookkeeping_processing_jobs', {
        p_lease_id: leaseTwo, p_limit: 25, p_lease_seconds: 15,
      }),
    ])
    expect(first.error ?? second.error).toBeNull()
    const firstIds = new Set((first.data ?? []).map((row: { id: string }) => row.id))
    const secondIds = new Set((second.data ?? []).map((row: { id: string }) => row.id))
    expect([...firstIds].filter((id) => secondIds.has(id))).toEqual([])
    const owned = [...(first.data ?? []), ...(second.data ?? [])]
      .find((row: { business_id: string }) => row.business_id === owner.businessId)
    expect(owned).toBeTruthy()
    const ownerLease = firstIds.has(owned.id) ? leaseOne : leaseTwo
    const wrongLease = ownerLease === leaseOne ? leaseTwo : leaseOne
    const wrongComplete = await admin.rpc('complete_bookkeeping_processing_job', {
      p_job_id: owned.id, p_lease_id: wrongLease,
    })
    expect(wrongComplete).toMatchObject({ data: false, error: null })
    const retried = await admin.rpc('retry_bookkeeping_processing_job', {
      p_job_id: owned.id, p_lease_id: ownerLease, p_error_code: 'TRANSIENT_TEST_FAILURE',
    })
    expect(retried).toMatchObject({ data: 'retryable', error: null })

    await admin.from('bookkeeping_processing_jobs').update({ available_at: new Date(0).toISOString() })
      .eq('id', owned.id)
    const reclaimLease = crypto.randomUUID()
    const reclaimed = await admin.rpc('claim_bookkeeping_processing_jobs', {
      p_lease_id: reclaimLease, p_limit: 25, p_lease_seconds: 15,
    })
    expect(reclaimed.data).toContainEqual(expect.objectContaining({ id: owned.id, attempt_count: 2 }))
    const completed = await admin.rpc('complete_bookkeeping_processing_job', {
      p_job_id: owned.id, p_lease_id: reclaimLease,
    })
    expect(completed).toMatchObject({ data: true, error: null })

    const idempotencyArgs = {
      p_business_id: owner.businessId,
      p_bookkeeping_record_id: owned.bookkeeping_record_id,
      p_processing_reason: 'lease_expiration_test',
      p_target_fingerprint: crypto.randomUUID(),
    }
    const requested = await admin.rpc('request_bookkeeping_processing', idempotencyArgs)
    const repeated = await admin.rpc('request_bookkeeping_processing', idempotencyArgs)
    expect(requested).toMatchObject({ error: null })
    expect(repeated.data).toBe(requested.data)
    const expiredLease = crypto.randomUUID()
    await admin.from('bookkeeping_processing_jobs').update({
      state: 'processing', attempt_count: 1, lease_id: expiredLease,
      lease_expires_at: new Date(0).toISOString(), claimed_at: new Date(0).toISOString(),
      created_at: new Date(0).toISOString(),
    }).eq('id', requested.data)
    const newLease = crypto.randomUUID()
    const expiredReclaim = await admin.rpc('claim_bookkeeping_processing_jobs', {
      p_lease_id: newLease, p_limit: 25, p_lease_seconds: 15,
    })
    expect(expiredReclaim.data).toContainEqual(expect.objectContaining({
      id: requested.data, lease_id: newLease, attempt_count: 2,
    }))
    await admin.from('bookkeeping_processing_jobs').update({
      attempt_count: 8, lease_expires_at: new Date(0).toISOString(),
    }).eq('id', requested.data)
    await admin.rpc('claim_bookkeeping_processing_jobs', {
      p_lease_id: crypto.randomUUID(), p_limit: 1, p_lease_seconds: 15,
    })
    const { data: deadLetter } = await admin.from('bookkeeping_processing_jobs')
      .select('state,last_error_code').eq('id', requested.data).single()
    expect(deadLetter).toEqual({ state: 'dead_letter', last_error_code: 'RETRY_LIMIT_EXCEEDED' })

    const other = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label: 'processing-other', amounts: [-1300],
    })
    const { data: otherRecord } = await admin.from('bookkeeping_records')
      .select('id').eq('business_id', other.businessId).single()
    const crossTenant = await admin.rpc('request_bookkeeping_processing', {
      p_business_id: owner.businessId,
      p_bookkeeping_record_id: otherRecord!.id,
      p_processing_reason: 'cross_tenant_test',
      p_target_fingerprint: crypto.randomUUID(),
    })
    expect(crossTenant.error).not.toBeNull()
  })
})
