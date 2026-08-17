import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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
  const email = `documentation-evidence-${label}-${crypto.randomUUID()}@example.test`
  const password = 'local-documentation-evidence-password'
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

function createReceipt(userId: string) {
  const receiptId = crypto.randomUUID()
  execFileSync('docker', ['exec', 'supabase_db_writeoffs_fresh',
    'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
    `insert into public.receipts (id,user_id,storage_path,mime_type,bytes) values ('${receiptId}','${userId}','documentation/${receiptId}.pdf','application/pdf',10)`],
  { stdio: 'pipe' })
  return receiptId
}

async function createRecord(admin: SupabaseClient, businessId: string, suffix: string) {
  return new SupabaseBookkeepingRepository(admin).ensureRecord({
    actor: { businessId, userId: null, provenance: 'automation' },
    record: {
      sourceKind: 'manual', financialTransactionId: null,
      ingestionKey: `documentation-evidence:${suffix}:${crypto.randomUUID()}`,
      amountCents: -8500, currency: 'USD', occurredOn: '2026-08-17',
    },
  })
}

async function openRequest(admin: SupabaseClient, businessId: string,
  recordId: string, issueKey: string, recognized = true) {
  return new CanonicalDocumentationService(
    new SupabaseBookkeepingRepository(admin)
  ).openRequest({
    businessId, recordId, reason: 'MISSING_SUPPORTING_DOCUMENTATION',
    issueKey, contextFingerprint: `${issueKey}:context:v1`,
    questionContext: {
      schemaVersion: 1, reason: 'MISSING_SUPPORTING_DOCUMENTATION',
      prompt: 'Attach the receipt or tell us it is unavailable.',
      ...(recognized
        ? { requirement: { type: 'receipt_for_record', version: 1 } }
        : {}),
    },
  })
}

async function history(admin: SupabaseClient, issueId: string) {
  const { data, error } = await admin.from('bookkeeping_documentation_events')
    .select('id,event_type,sequence_number,bookkeeping_document_link_id,evidence_satisfies_request')
    .eq('documentation_issue_id', issueId).order('sequence_number')
  if (error) throw error
  return data
}

function lostInput(customer: SupabaseClient,
  event: Awaited<ReturnType<typeof openRequest>>) {
  return {
    supabase: customer, issueId: event.documentationIssueId,
    expectedCurrentEventId: event.id,
    expectedContextFingerprint: event.contextFingerprint,
    expectedEvidenceFingerprint: event.evidenceFingerprint,
    answer: { schemaVersion: 1, assertion: 'receipt_lost' } as const,
  }
}

describe.skipIf(!runLocal)('documentation evidence integration on local Supabase', () => {
  it('atomically resolves a recognized request and converges duplicate attachment', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'satisfying')
    const record = await createRecord(admin, owner.businessId, 'satisfying')
    const receiptId = createReceipt(owner.userId)
    const opened = await openRequest(admin, owner.businessId, record.id, 'receipt:satisfying')
    const repository = new SupabaseBookkeepingRepository(owner.customer)
    const initialDecision = await repository.ensureInitialUnresolvedDecision(
      owner.businessId, record.id
    )
    const protectedTables = [
      'bookkeeping_decisions', 'bookkeeping_allocations',
      'bookkeeping_review_events',
    ] as const
    const before = await Promise.all(protectedTables.map(async (table) =>
      (await admin.from(table).select('*', { count: 'exact', head: true })
        .eq('business_id', owner.businessId)).count
    ))
    const { data: legacyBefore } = await admin.from('transactions')
      .select('id,receipt_waived,needs_review,approved,category_key')
      .eq('user_id', owner.userId)

    const outcomes = await Promise.all([
      repository.attachReceiptWithDocumentation({
        actor: { businessId: owner.businessId, userId: owner.userId, provenance: 'user' },
        recordId: record.id, receiptId,
      }),
      repository.attachReceiptWithDocumentation({
        actor: { businessId: owner.businessId, userId: owner.userId, provenance: 'user' },
        recordId: record.id, receiptId,
      }),
    ])
    expect(outcomes[1].id).toBe(outcomes[0].id)
    expect(await history(admin, opened.documentationIssueId)).toMatchObject([
      { event_type: 'request_opened', sequence_number: 1 },
      { event_type: 'evidence_attached', sequence_number: 2,
        bookkeeping_document_link_id: outcomes[0].id,
        evidence_satisfies_request: true },
      { event_type: 'resolved', sequence_number: 3 },
    ])
    expect(await new CanonicalDocumentationService(repository)
      .listOutstanding(owner.businessId)).toEqual([])
    expect(await repository.findCurrentDecision(owner.businessId, record.id))
      .toEqual(initialDecision)
    const after = await Promise.all(protectedTables.map(async (table) =>
      (await admin.from(table).select('*', { count: 'exact', head: true })
        .eq('business_id', owner.businessId)).count
    ))
    expect(after).toEqual(before)
    const { data: legacyAfter } = await admin.from('transactions')
      .select('id,receipt_waived,needs_review,approved,category_key')
      .eq('user_id', owner.userId)
    expect(legacyAfter).toEqual(legacyBefore)
    const { data: receipt } = await admin.from('receipts')
      .select('transaction_id').eq('id', receiptId).single()
    expect(receipt?.transaction_id).toBeNull()
  })

  it('preserves Receipt Lost before later evidence and does not re-nag after revocation', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'lost-found')
    const record = await createRecord(admin, owner.businessId, 'lost-found')
    const receiptId = createReceipt(owner.userId)
    const opened = await openRequest(admin, owner.businessId, record.id, 'receipt:lost-found')
    const lost = await markReceiptLost(lostInput(owner.customer, opened))
    const repository = new SupabaseBookkeepingRepository(owner.customer)
    const link = await repository.attachReceiptWithDocumentation({
      actor: { businessId: owner.businessId, userId: owner.userId, provenance: 'user' },
      recordId: record.id, receiptId,
    })
    expect((await history(admin, opened.documentationIssueId)).map((event) => event.event_type))
      .toEqual(['request_opened', 'receipt_lost', 'resolved', 'evidence_attached', 'resolved'])

    await repository.revokeReceiptLinkWithDocumentation({
      actor: { businessId: owner.businessId, userId: owner.userId, provenance: 'user' },
      linkId: link.id, reason: 'This was the wrong receipt.',
    })
    expect((await history(admin, opened.documentationIssueId)).map((event) => event.event_type))
      .toEqual(['request_opened', 'receipt_lost', 'resolved', 'evidence_attached', 'resolved'])
    expect(await new CanonicalDocumentationService(repository)
      .listOutstanding(owner.businessId)).toEqual([])
    expect(lost.receiptLostEvent.eventType).toBe('receipt_lost')
  })

  it('creates no issue without one and keeps an unrecognized requirement outstanding', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'unknown')
    const repository = new SupabaseBookkeepingRepository(owner.customer)
    const noIssueRecord = await createRecord(admin, owner.businessId, 'no-issue')
    const noIssueReceipt = createReceipt(owner.userId)
    const noIssueLink = await repository.attachReceiptWithDocumentation({
      actor: { businessId: owner.businessId, userId: owner.userId, provenance: 'user' },
      recordId: noIssueRecord.id, receiptId: noIssueReceipt,
    })
    const { count: noIssueEvents } = await admin.from('bookkeeping_documentation_events')
      .select('*', { count: 'exact', head: true })
      .eq('bookkeeping_record_id', noIssueRecord.id)
    expect(noIssueEvents).toBe(0)
    await repository.revokeReceiptLinkWithDocumentation({
      actor: { businessId: owner.businessId, userId: owner.userId, provenance: 'user' },
      linkId: noIssueLink.id, reason: 'Wrong record.',
    })
    expect((await admin.from('bookkeeping_documentation_events')
      .select('*', { count: 'exact', head: true })
      .eq('bookkeeping_record_id', noIssueRecord.id)).count).toBe(0)

    const unknownRecord = await createRecord(admin, owner.businessId, 'unknown')
    const unknownReceipt = createReceipt(owner.userId)
    const opened = await openRequest(
      admin, owner.businessId, unknownRecord.id, 'receipt:unknown', false
    )
    await repository.attachReceiptWithDocumentation({
      actor: { businessId: owner.businessId, userId: owner.userId, provenance: 'user' },
      recordId: unknownRecord.id, receiptId: unknownReceipt,
    })
    const events = await history(admin, opened.documentationIssueId)
    expect(events.at(-1)).toMatchObject({
      event_type: 'evidence_attached', evidence_satisfies_request: false,
    })
    const outstanding = await new CanonicalDocumentationService(repository)
      .listOutstanding(owner.businessId)
    expect(outstanding.map((event) => event.documentationIssueId))
      .toContain(opened.documentationIssueId)
    await markReceiptLost({ ...lostInput(owner.customer, opened),
      expectedCurrentEventId: events.at(-1)!.id,
      expectedEvidenceFingerprint: outstanding.find((event) =>
        event.documentationIssueId === opened.documentationIssueId)!.evidenceFingerprint,
    })
  })

  it('reopens only after the last satisfying link is revoked', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'revocation')
    const record = await createRecord(admin, owner.businessId, 'revocation')
    const firstReceipt = createReceipt(owner.userId)
    const secondReceipt = createReceipt(owner.userId)
    const opened = await openRequest(admin, owner.businessId, record.id, 'receipt:revocation')
    const repository = new SupabaseBookkeepingRepository(owner.customer)
    const first = await repository.attachReceiptWithDocumentation({
      actor: { businessId: owner.businessId, userId: owner.userId, provenance: 'user' },
      recordId: record.id, receiptId: firstReceipt,
    })
    const second = await repository.attachReceiptWithDocumentation({
      actor: { businessId: owner.businessId, userId: owner.userId, provenance: 'user' },
      recordId: record.id, receiptId: secondReceipt,
    })
    await repository.revokeReceiptLinkWithDocumentation({
      actor: { businessId: owner.businessId, userId: owner.userId, provenance: 'user' },
      linkId: first.id, reason: 'First link was incorrect.',
    })
    expect(await new CanonicalDocumentationService(repository)
      .listOutstanding(owner.businessId)).toEqual([])
    await repository.revokeReceiptLinkWithDocumentation({
      actor: { businessId: owner.businessId, userId: owner.userId, provenance: 'user' },
      linkId: second.id, reason: 'Second link was incorrect.',
    })
    const outstanding = await new CanonicalDocumentationService(repository)
      .listOutstanding(owner.businessId)
    expect(outstanding).toHaveLength(1)
    expect(outstanding[0]).toMatchObject({
      documentationIssueId: opened.documentationIssueId,
      eventType: 'reopened',
    })
  })

  it('serializes Receipt Lost against attachment and enforces ownership/RLS', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'race-owner')
    const outsider = await createUser(admin, 'race-outsider')
    const record = await createRecord(admin, owner.businessId, 'race')
    const receiptId = createReceipt(owner.userId)
    const outsiderReceipt = createReceipt(outsider.userId)
    const opened = await openRequest(admin, owner.businessId, record.id, 'receipt:race')
    const repository = new SupabaseBookkeepingRepository(owner.customer)
    const race = await Promise.allSettled([
      markReceiptLost(lostInput(owner.customer, opened)),
      repository.attachReceiptWithDocumentation({
        actor: { businessId: owner.businessId, userId: owner.userId, provenance: 'user' },
        recordId: record.id, receiptId,
      }),
    ])
    expect(race.some((result) => result.status === 'fulfilled')).toBe(true)
    const events = await history(admin, opened.documentationIssueId)
    expect(events.filter((event) => event.event_type === 'receipt_lost')).toHaveLength(
      race[0].status === 'fulfilled' ? 1 : 0
    )
    expect(events.filter((event) => event.event_type === 'evidence_attached')).toHaveLength(1)

    await expect(repository.attachReceiptWithDocumentation({
      actor: { businessId: owner.businessId, userId: owner.userId, provenance: 'user' },
      recordId: record.id, receiptId: outsiderReceipt,
    })).rejects.toThrow(/unavailable/)
    await expect(new SupabaseBookkeepingRepository(client(anonKey!))
      .attachReceiptWithDocumentation({
        actor: { businessId: owner.businessId, userId: null, provenance: 'user' },
        recordId: record.id, receiptId,
      })).rejects.toThrow(/authentication|permission denied/)
    const { data: hidden } = await outsider.customer
      .from('bookkeeping_documentation_events').select('id')
      .eq('business_id', owner.businessId)
    expect(hidden).toEqual([])
    const { error: directLinkError } = await owner.customer
      .from('bookkeeping_document_links').insert({
        business_id: owner.businessId,
        bookkeeping_record_id: record.id,
        receipt_id: receiptId,
        provenance: 'user',
        actor_user_id: owner.userId,
      })
    expect(directLinkError).not.toBeNull()
    const { error: directRevokeError } = await owner.customer
      .from('bookkeeping_document_links')
      .update({ revoked_at: new Date().toISOString(), revocation_reason: 'Bypass' })
      .eq('id', race[1].status === 'fulfilled' ? race[1].value.id : crypto.randomUUID())
    expect(directRevokeError).not.toBeNull()

    const root = events[0]
    const { error: fakeError } = await admin.from('bookkeeping_documentation_events').insert({
      business_id: owner.businessId, bookkeeping_record_id: record.id,
      documentation_issue_id: opened.documentationIssueId,
      supersedes_event_id: events.at(-1)!.id,
      sequence_number: events.at(-1)!.sequence_number + 1,
      event_type: 'evidence_attached', reason: 'MISSING_SUPPORTING_DOCUMENTATION',
      issue_key: 'receipt:race', context_fingerprint: opened.contextFingerprint,
      evidence_fingerprint: `${opened.evidenceFingerprint}:fake`,
      question_context: root, assertion_payload: {
        schemaVersion: 1, observation: 'document_linked', satisfiesRequirement: true,
      }, provenance: 'system', bookkeeping_document_link_id: crypto.randomUUID(),
      evidence_satisfies_request: true,
    })
    expect(fakeError).not.toBeNull()
  })
})
