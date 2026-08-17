import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  CanonicalDocumentationService,
  markReceiptLost,
} from '../../app/lib/bookkeeping/documentation-events'
import { SupabaseBookkeepingRepository } from '../../app/lib/bookkeeping/supabase-repository'

const localUrl = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const runLocal = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' &&
  Boolean(localUrl && anonKey && serviceKey)

function client(key: string) {
  return createClient(localUrl!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function createUser(admin: SupabaseClient, label: string) {
  const email = `documentation-${label}-${crypto.randomUUID()}@example.test`
  const password = 'local-documentation-password'
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('user creation failed')
  const customer = client(anonKey!)
  const { error: signInError } = await customer.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  const { data: business, error: businessError } = await admin.from('businesses')
    .select('id').eq('owner_user_id', data.user.id).single()
  if (businessError) throw businessError
  return { customer, userId: data.user.id, businessId: business.id as string }
}

async function createRecord(admin: SupabaseClient, customer: SupabaseClient,
  businessId: string, suffix: string) {
  const trusted = new SupabaseBookkeepingRepository(admin)
  const customerRepository = new SupabaseBookkeepingRepository(customer)
  const record = await trusted.ensureRecord({
    actor: { businessId, userId: null, provenance: 'automation' },
    record: { sourceKind: 'manual', financialTransactionId: null,
      ingestionKey: `documentation:${suffix}:${crypto.randomUUID()}`,
      amountCents: -7500, currency: 'USD', occurredOn: '2026-08-17' },
  })
  const decision = await customerRepository.ensureInitialUnresolvedDecision(
    businessId, record.id
  )
  return { record, decision }
}

async function openRequest(admin: SupabaseClient, businessId: string,
  recordId: string, issueKey: string) {
  return new CanonicalDocumentationService(
    new SupabaseBookkeepingRepository(admin)
  ).openRequest({
    businessId, recordId, reason: 'MISSING_SUPPORTING_DOCUMENTATION',
    issueKey, contextFingerprint: `${issueKey}:context:v1`,
    questionContext: {
      schemaVersion: 1, reason: 'MISSING_SUPPORTING_DOCUMENTATION',
      prompt: 'Please attach supporting documentation or tell us the receipt is unavailable.',
    },
  })
}

function answerInput(customer: SupabaseClient,
  event: Awaited<ReturnType<typeof openRequest>>) {
  return { supabase: customer, issueId: event.documentationIssueId,
    expectedCurrentEventId: event.id,
    expectedContextFingerprint: event.contextFingerprint,
    expectedEvidenceFingerprint: event.evidenceFingerprint,
    answer: { schemaVersion: 1, assertion: 'receipt_lost' } as const }
}

describe.skipIf(!runLocal)('canonical documentation events on local Supabase', () => {
  it('opens idempotently and concurrently, tenant-scopes the outstanding query', async () => {
    const admin = client(serviceKey!)
    const a = await createUser(admin, 'open-a')
    const b = await createUser(admin, 'open-b')
    const aRecord = await createRecord(admin, a.customer, a.businessId, 'open-a')
    const service = new CanonicalDocumentationService(new SupabaseBookkeepingRepository(admin))
    const [first, repeated] = await Promise.all([
      openRequest(admin, a.businessId, aRecord.record.id, 'missing:v1'),
      openRequest(admin, a.businessId, aRecord.record.id, 'missing:v1'),
    ])
    expect(repeated.id).toBe(first.id)
    expect((await new CanonicalDocumentationService(
      new SupabaseBookkeepingRepository(a.customer)
    ).listOutstanding(a.businessId)).map((event) => event.id)).toEqual([first.id])
    expect(await new CanonicalDocumentationService(
      new SupabaseBookkeepingRepository(b.customer)
    ).listOutstanding(b.businessId)).toEqual([])
    await expect(Promise.resolve().then(() => service.openRequest({
      businessId: a.businessId, recordId: aRecord.record.id,
      reason: 'GENERIC_DOCUMENTATION_TASK', issueKey: 'generic',
      contextFingerprint: 'generic', questionContext: {},
    }))).rejects.toThrow(/not supported/)
  })

  it('atomically records Receipt Lost without changing bookkeeping, review, links, or legacy data', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'lost')
    const base = await createRecord(admin, owner.customer, owner.businessId, 'lost')
    const opened = await openRequest(admin, owner.businessId, base.record.id, 'missing:lost')
    const tables = ['bookkeeping_decisions', 'bookkeeping_allocations',
      'bookkeeping_review_events', 'bookkeeping_document_links'] as const
    const before = await Promise.all(tables.map(async (table) => {
      const { count } = await admin.from(table).select('*', { count: 'exact', head: true })
        .eq('business_id', owner.businessId)
      return count
    }))
    const { data: legacyBefore } = await admin.from('transactions')
      .select('id,receipt_waived,needs_review,approved,category_key')
      .eq('user_id', owner.userId)

    const outcomes = await Promise.allSettled([
      markReceiptLost(answerInput(owner.customer, opened)),
      markReceiptLost(answerInput(owner.customer, opened)),
    ])
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
    const success = outcomes.find((outcome) => outcome.status === 'fulfilled')
    if (!success || success.status !== 'fulfilled') throw new Error('Receipt Lost did not succeed')
    expect(success.value.receiptLostEvent).toMatchObject({
      eventType: 'receipt_lost', provenance: 'user',
      assertionPayload: { schemaVersion: 1, assertion: 'receipt_lost' },
    })
    expect(success.value.resolvedEvent).toMatchObject({
      eventType: 'resolved', provenance: 'system',
    })
    const { data: history } = await admin.from('bookkeeping_documentation_events')
      .select('event_type,sequence_number').eq('documentation_issue_id', opened.documentationIssueId)
      .order('sequence_number')
    expect(history).toEqual([
      { event_type: 'request_opened', sequence_number: 1 },
      { event_type: 'receipt_lost', sequence_number: 2 },
      { event_type: 'resolved', sequence_number: 3 },
    ])
    expect(await new CanonicalDocumentationService(
      new SupabaseBookkeepingRepository(owner.customer)
    ).listOutstanding(owner.businessId)).toEqual([])

    const after = await Promise.all(tables.map(async (table) => {
      const { count } = await admin.from(table).select('*', { count: 'exact', head: true })
        .eq('business_id', owner.businessId)
      return count
    }))
    expect(after).toEqual(before)
    const current = await new SupabaseBookkeepingRepository(owner.customer)
      .findCurrentDecision(owner.businessId, base.record.id)
    expect(current).toEqual(base.decision)
    const { data: legacyAfter } = await admin.from('transactions')
      .select('id,receipt_waived,needs_review,approved,category_key')
      .eq('user_id', owner.userId)
    expect(legacyAfter).toEqual(legacyBefore)

    const replay = await openRequest(admin, owner.businessId, base.record.id, 'missing:lost')
    expect(replay.id).toBe(success.value.resolvedEvent.id)
  })

  it('rejects malformed, anonymous, cross-tenant, and stale assertions', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'security-owner')
    const outsider = await createUser(admin, 'security-outsider')
    const base = await createRecord(admin, owner.customer, owner.businessId, 'security')
    const opened = await openRequest(admin, owner.businessId, base.record.id, 'missing:security')
    await expect(markReceiptLost({ ...answerInput(owner.customer, opened),
      answer: { schemaVersion: 1, assertion: 'receipt_lost', note: 'not allowed' },
    })).rejects.toThrow(/Only schemaVersion/)
    await expect(markReceiptLost({ ...answerInput(owner.customer, opened),
      expectedCurrentEventId: crypto.randomUUID(),
    })).rejects.toThrow(/current documentation event changed|unavailable/)
    await expect(markReceiptLost({ ...answerInput(owner.customer, opened),
      expectedContextFingerprint: 'stale',
    })).rejects.toThrow(/context changed/)
    await expect(markReceiptLost({ ...answerInput(owner.customer, opened),
      expectedEvidenceFingerprint: 'stale',
    })).rejects.toThrow(/context changed/)
    await expect(markReceiptLost({ ...answerInput(outsider.customer, opened) }))
      .rejects.toThrow(/unavailable/)
    await expect(markReceiptLost({ ...answerInput(client(anonKey!), opened) }))
      .rejects.toThrow(/authenticated user/)
    const { data: crossTenant } = await outsider.customer
      .from('bookkeeping_documentation_events').select('id')
      .eq('business_id', owner.businessId)
    expect(crossTenant).toEqual([])
    const { error: directInsertError } = await owner.customer
      .from('bookkeeping_documentation_events').insert({
        business_id: owner.businessId,
        bookkeeping_record_id: base.record.id,
        documentation_issue_id: crypto.randomUUID(),
        sequence_number: 1,
        event_type: 'request_opened',
        reason: 'MISSING_SUPPORTING_DOCUMENTATION',
        issue_key: 'customer-forgery',
        context_fingerprint: 'customer-forgery',
        evidence_fingerprint: 'customer-forgery',
        question_context: { schemaVersion: 1,
          reason: 'MISSING_SUPPORTING_DOCUMENTATION' },
        provenance: 'system',
      })
    expect(directInsertError).not.toBeNull()
  })

  it('rejects mutation and unchanged reopen, but permits materially changed evidence/context', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'reopen')
    const base = await createRecord(admin, owner.customer, owner.businessId, 'reopen')
    const opened = await openRequest(admin, owner.businessId, base.record.id, 'missing:reopen')
    const completed = await markReceiptLost(answerInput(owner.customer, opened))
    const trusted = new CanonicalDocumentationService(new SupabaseBookkeepingRepository(admin))
    await expect(trusted.reopenRequest({
      businessId: owner.businessId, issueId: opened.documentationIssueId,
      expectedCurrentEventId: completed.resolvedEvent.id,
      contextFingerprint: 'missing:reopen:context:v2',
      questionContext: { schemaVersion: 1,
        reason: 'MISSING_SUPPORTING_DOCUMENTATION', prompt: 'New request.' },
    })).rejects.toThrow(/new context and evidence/)

    const receiptId = crypto.randomUUID()
    execFileSync('docker', ['exec', 'supabase_db_writeoffs_fresh',
      'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
      `insert into public.receipts (id,user_id,storage_path,mime_type,bytes) values ('${receiptId}','${owner.userId}','documentation/${receiptId}.pdf','application/pdf',10)`],
    { stdio: 'pipe' })
    const link = await new SupabaseBookkeepingRepository(admin).ensureDocumentLink({
      actor: { businessId: owner.businessId, userId: null, provenance: 'automation' },
      recordId: base.record.id, receiptId,
    })
    const { error: revokeError } = await admin.from('bookkeeping_document_links').update({
      revoked_at: new Date().toISOString(), revocation_reason: 'Incorrect evidence',
    }).eq('id', link.id)
    if (revokeError) throw revokeError
    const reopened = await trusted.reopenRequest({
      businessId: owner.businessId, issueId: opened.documentationIssueId,
      expectedCurrentEventId: completed.resolvedEvent.id,
      contextFingerprint: 'missing:reopen:context:v2',
      questionContext: { schemaVersion: 1,
        reason: 'MISSING_SUPPORTING_DOCUMENTATION', prompt: 'The prior evidence was incorrect.' },
    })
    expect(reopened.eventType).toBe('reopened')

    const staleBase = await createRecord(
      admin, owner.customer, owner.businessId, 'stale-evidence'
    )
    const staleOpened = await openRequest(
      admin, owner.businessId, staleBase.record.id, 'missing:stale-evidence'
    )
    await new SupabaseBookkeepingRepository(admin).ensureDocumentLink({
      actor: { businessId: owner.businessId, userId: null, provenance: 'automation' },
      recordId: staleBase.record.id, receiptId,
    })
    await expect(markReceiptLost(answerInput(owner.customer, staleOpened)))
      .rejects.toThrow(/evidence changed/)

    const { error: updateError } = await admin.from('bookkeeping_documentation_events')
      .update({ issue_key: 'changed' }).eq('id', opened.id)
    const { error: deleteError } = await admin.from('bookkeeping_documentation_events')
      .delete().eq('id', opened.id)
    expect(updateError).not.toBeNull()
    expect(deleteError).not.toBeNull()
  })
})
