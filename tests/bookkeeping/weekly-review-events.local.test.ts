import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { listCanonicalReviewQueue } from '../../app/lib/bookkeeping/review-queue'
import { CanonicalWeeklyReviewService } from '../../app/lib/bookkeeping/review-events'
import { SupabaseBookkeepingRepository } from '../../app/lib/bookkeeping/supabase-repository'

const localUrl = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const runLocal = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' &&
  Boolean(localUrl && anonKey && serviceKey)

function client(key: string) {
  return createClient(localUrl!, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function createUser(admin: SupabaseClient, label: string) {
  const email = `weekly-${label}-${crypto.randomUUID()}@example.test`
  const password = 'local-weekly-password'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('local user creation failed')
  const customer = client(anonKey!)
  const { error: signInError } = await customer.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  const { data: business, error: businessError } = await admin
    .from('businesses').select('id').eq('owner_user_id', data.user.id).single()
  if (businessError) throw businessError
  return { customer, userId: data.user.id, businessId: business.id as string }
}

async function createCanonicalRecord(
  admin: SupabaseClient,
  customer: SupabaseClient,
  businessId: string,
  suffix: string
) {
  const trustedRepository = new SupabaseBookkeepingRepository(admin)
  const record = await trustedRepository.ensureRecord({
    actor: { businessId, userId: null, provenance: 'automation' },
    record: {
      sourceKind: 'manual', financialTransactionId: null,
      ingestionKey: `weekly-review:${suffix}:${crypto.randomUUID()}`,
      amountCents: -2500, currency: 'USD', occurredOn: '2026-08-17',
    },
  })
  const customerRepository = new SupabaseBookkeepingRepository(customer)
  const decision = await customerRepository.ensureInitialUnresolvedDecision(businessId, record.id)
  return { record, decision }
}

describe.skipIf(!runLocal)('canonical Weekly Review events on local Supabase', () => {
  it('enforces typed append-only tenant history and event-derived queue behavior', async () => {
    const admin = client(serviceKey!)
    const a = await createUser(admin, 'a')
    const b = await createUser(admin, 'b')
    const recordA = await createCanonicalRecord(admin, a.customer, a.businessId, 'a')
    const recordB = await createCanonicalRecord(admin, b.customer, b.businessId, 'b')
    const trusted = new CanonicalWeeklyReviewService(
      new SupabaseBookkeepingRepository(admin)
    )
    const customerA = new CanonicalWeeklyReviewService(
      new SupabaseBookkeepingRepository(a.customer)
    )

    // An unresolved canonical decision alone is agent backlog, not Weekly Review.
    expect(recordA.decision.treatment).toBe('unresolved')
    expect(await listCanonicalReviewQueue({ supabase: a.customer })).toEqual([])

    await expect(trusted.openIssue({
      businessId: a.businessId, recordId: recordA.record.id,
      decisionId: recordA.decision.id, reason: 'GENERIC_APPROVAL',
      issueKey: 'generic', contextFingerprint: 'context-1',
    })).rejects.toThrow('not supported')

    const opens = await Promise.all([
      trusted.openIssue({
        businessId: a.businessId, recordId: recordA.record.id,
        decisionId: recordA.decision.id, reason: 'BUSINESS_USE_UNCLEAR',
        issueKey: 'business-use:v1', contextFingerprint: 'evidence:v1',
      }),
      trusted.openIssue({
        businessId: a.businessId, recordId: recordA.record.id,
        decisionId: recordA.decision.id, reason: 'BUSINESS_USE_UNCLEAR',
        issueKey: 'business-use:v1', contextFingerprint: 'evidence:v1',
      }),
    ])
    expect(opens[0].reviewIssueId).toBe(opens[1].reviewIssueId)
    expect(opens[0].id).toBe(opens[1].id)
    expect((await listCanonicalReviewQueue({ supabase: a.customer })).map((item) => item.event.id))
      .toEqual([opens[0].id])
    expect(await listCanonicalReviewQueue({ supabase: b.customer })).toEqual([])

    const customerB = new CanonicalWeeklyReviewService(
      new SupabaseBookkeepingRepository(b.customer)
    )
    await expect(customerB.skipIssue({
      businessId: a.businessId, userId: b.userId,
      issueId: opens[0].reviewIssueId, expectedCurrentEventId: opens[0].id,
      deferredUntil: null,
    })).rejects.toThrow()

    await expect(trusted.openIssue({
      businessId: a.businessId, recordId: recordB.record.id,
      decisionId: recordB.decision.id, reason: 'BUSINESS_USE_UNCLEAR',
      issueKey: 'cross-tenant', contextFingerprint: 'cross-tenant',
    })).rejects.toThrow()

    const deferred = await customerA.skipIssue({
      businessId: a.businessId, userId: a.userId,
      issueId: opens[0].reviewIssueId, expectedCurrentEventId: opens[0].id,
      deferredUntil: '2030-01-01T00:00:00.000Z',
    })
    expect(deferred.eventType).toBe('skipped')
    expect(deferred.actorUserId).toBe(a.userId)
    expect(await customerA.listQueue(a.businessId, '2029-01-01T00:00:00.000Z')).toEqual([])
    expect((await customerA.listQueue(a.businessId, '2031-01-01T00:00:00.000Z'))[0].event.id)
      .toBe(deferred.id)

    const resolved = await trusted.resolveIssue({
      businessId: a.businessId, issueId: deferred.reviewIssueId,
      expectedCurrentEventId: deferred.id,
    })
    expect(await listCanonicalReviewQueue({ supabase: a.customer })).toEqual([])
    const replay = await trusted.openIssue({
      businessId: a.businessId, recordId: recordA.record.id,
      decisionId: recordA.decision.id, reason: 'BUSINESS_USE_UNCLEAR',
      issueKey: 'business-use:v1', contextFingerprint: 'evidence:v1',
    })
    expect(replay.id).toBe(resolved.id)
    await expect(trusted.reopenIssue({
      businessId: a.businessId, issueId: resolved.reviewIssueId,
      expectedCurrentEventId: resolved.id, decisionId: recordA.decision.id,
      contextFingerprint: 'evidence:v1',
    })).rejects.toThrow()
    const reopened = await trusted.reopenIssue({
      businessId: a.businessId, issueId: resolved.reviewIssueId,
      expectedCurrentEventId: resolved.id, decisionId: recordA.decision.id,
      contextFingerprint: 'evidence:v2',
    })
    expect((await listCanonicalReviewQueue({ supabase: a.customer }))[0].event.id).toBe(reopened.id)

    const { data: history } = await admin.from('bookkeeping_review_events')
      .select('id,event_type,sequence_number').eq('review_issue_id', reopened.reviewIssueId)
      .order('sequence_number')
    expect(history?.map((event) => event.event_type)).toEqual([
      'opened', 'skipped', 'resolved', 'reopened',
    ])

    const { error: branchError } = await admin.from('bookkeeping_review_events').insert({
      business_id: a.businessId, bookkeeping_record_id: recordA.record.id,
      review_issue_id: reopened.reviewIssueId, supersedes_event_id: resolved.id,
      sequence_number: 4, event_type: 'reopened', reason: 'BUSINESS_USE_UNCLEAR',
      based_on_decision_id: recordA.decision.id, issue_key: 'business-use:v1',
      context_fingerprint: 'evidence:branch', provenance: 'automation',
    })
    expect(branchError).not.toBeNull()
    const arbitraryIssueId = crypto.randomUUID()
    const { error: arbitraryReasonError } = await admin
      .from('bookkeeping_review_events').insert({
        id: arbitraryIssueId, business_id: a.businessId,
        bookkeeping_record_id: recordA.record.id, review_issue_id: arbitraryIssueId,
        sequence_number: 1, event_type: 'opened', reason: 'GENERIC_APPROVAL',
        based_on_decision_id: recordA.decision.id, issue_key: 'generic-direct',
        context_fingerprint: 'generic-direct', provenance: 'automation',
      })
    expect(arbitraryReasonError).not.toBeNull()
    const { error: updateError } = await admin.from('bookkeeping_review_events')
      .update({ issue_key: 'changed' }).eq('id', opens[0].id)
    const { error: deleteError } = await admin.from('bookkeeping_review_events')
      .delete().eq('id', opens[0].id)
    expect(updateError).not.toBeNull()
    expect(deleteError).not.toBeNull()

    const { error: customerSystemInsert } = await a.customer.from('bookkeeping_review_events').insert({
      business_id: a.businessId, bookkeeping_record_id: recordA.record.id,
      review_issue_id: crypto.randomUUID(), sequence_number: 1, event_type: 'opened',
      reason: 'BUSINESS_USE_UNCLEAR', based_on_decision_id: recordA.decision.id,
      issue_key: 'impersonation', context_fingerprint: 'impersonation', provenance: 'system',
    })
    expect(customerSystemInsert).not.toBeNull()
    const { data: crossTenantRead } = await a.customer.from('bookkeeping_review_events')
      .select('id').eq('business_id', b.businessId)
    expect(crossTenantRead).toEqual([])

  })
})
