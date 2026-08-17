import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { applyAutomatedBookkeepingDecision } from '../../app/lib/bookkeeping/agent-resolution'
import { answerBusinessPurposeReviewIssue } from '../../app/lib/bookkeeping/review-answer-workflow'
import { listCanonicalReviewQueue } from '../../app/lib/bookkeeping/review-queue'
import { CanonicalWeeklyReviewService } from '../../app/lib/bookkeeping/review-events'
import { SupabaseBookkeepingRepository } from '../../app/lib/bookkeeping/supabase-repository'
import type { WeeklyReviewReason } from '../../app/lib/bookkeeping/model'

const localUrl = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const runLocal = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' &&
  Boolean(localUrl && anonKey && serviceKey)

function client(key: string) {
  return createClient(localUrl!, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function createUser(admin: SupabaseClient, label: string) {
  const email = `answer-${label}-${crypto.randomUUID()}@example.test`
  const password = 'local-answer-password'
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

async function createPurposeIssue(input: {
  admin: SupabaseClient
  customer: SupabaseClient
  businessId: string
  suffix: string
  reason?: WeeklyReviewReason
}) {
  const trustedRepository = new SupabaseBookkeepingRepository(input.admin)
  const customerRepository = new SupabaseBookkeepingRepository(input.customer)
  const record = await trustedRepository.ensureRecord({
    actor: { businessId: input.businessId, userId: null, provenance: 'automation' },
    record: {
      sourceKind: 'manual', financialTransactionId: null,
      ingestionKey: `answer:${input.suffix}:${crypto.randomUUID()}`,
      amountCents: -4321, currency: 'USD', occurredOn: '2026-08-17',
    },
  })
  const initial = await customerRepository.ensureInitialUnresolvedDecision(
    input.businessId, record.id
  )
  const decision = await applyAutomatedBookkeepingDecision({
    repository: trustedRepository,
    businessId: input.businessId,
    recordId: record.id,
    expectedCurrentDecisionId: initial.id,
    proposal: {
      bookkeepingNature: 'expense', treatment: 'business',
      reviewStatus: 'needs_review', confidence: 0.91,
      reason: 'Known business meal needs its factual purpose.',
      businessPurpose: null,
      allocations: [{ kind: 'business', amountCents: -4321, memo: 'Preserve me' }],
      basis: {
        evidenceSufficient: true, ruleKey: 'meal-purpose-required', ruleAllowed: true,
        businessPurposeSupported: false, mixedUseAllocationSupported: false,
      },
    },
  })
  const reason = input.reason ?? 'BUSINESS_PURPOSE_NEEDED'
  const event = await new CanonicalWeeklyReviewService(trustedRepository).openIssue({
    businessId: input.businessId, recordId: record.id, decisionId: decision.id,
    reason, issueKey: `${reason}:${input.suffix}`,
    contextFingerprint: `context:${input.suffix}:v1`,
    questionContext: { schemaVersion: 1, reason },
  })
  if (!event.evidenceFingerprint) throw new Error('local review evidence fingerprint missing')
  return { record, initial, decision, event }
}

function answerInput(
  customer: SupabaseClient,
  fixture: Awaited<ReturnType<typeof createPurposeIssue>>,
  businessPurpose = '  Lunch with a prospective client  '
) {
  return {
    supabase: customer,
    reviewIssueId: fixture.event.reviewIssueId,
    expectedCurrentEventId: fixture.event.id,
    expectedCurrentDecisionId: fixture.decision.id,
    expectedContextFingerprint: fixture.event.contextFingerprint,
    expectedEvidenceFingerprint: fixture.event.evidenceFingerprint!,
    answer: { schemaVersion: 1, businessPurpose },
  }
}

describe.skipIf(!runLocal)('canonical Weekly Review business-purpose answers on local Supabase', () => {
  it('atomically appends the preserved user decision and closes the issue', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'valid')
    const fixture = await createPurposeIssue({ admin, ...owner, suffix: 'valid' })
    const result = await answerBusinessPurposeReviewIssue(
      answerInput(owner.customer, fixture)
    )

    expect(result.decision).toMatchObject({
      bookkeepingNature: fixture.decision.bookkeepingNature,
      treatment: fixture.decision.treatment,
      reviewStatus: 'resolved', provenance: 'user', actorUserId: owner.userId,
      confidence: null, reason: fixture.decision.reason,
      businessPurpose: 'Lunch with a prospective client',
      allocations: fixture.decision.allocations,
    })
    expect(result.decision.supersedesDecisionId).toBe(fixture.decision.id)
    expect(result.answeredEvent).toMatchObject({
      eventType: 'answered', provenance: 'user', actorUserId: owner.userId,
      answerPayload: { schemaVersion: 1, businessPurpose: 'Lunch with a prospective client' },
      resultingDecisionId: result.decision.id,
    })
    expect(result.resolvedEvent).toMatchObject({
      eventType: 'resolved', provenance: 'system',
      resultingDecisionId: result.decision.id,
    })
    expect(await listCanonicalReviewQueue({ supabase: owner.customer })).toEqual([])

    const { data: decisions } = await admin.from('bookkeeping_decisions')
      .select('id,supersedes_decision_id,provenance,confidence,business_purpose')
      .eq('bookkeeping_record_id', fixture.record.id).order('created_at')
    expect(decisions).toHaveLength(3)
    expect(decisions?.map((decision) => decision.id)).toContain(fixture.decision.id)
    const { data: history } = await admin.from('bookkeeping_review_events')
      .select('event_type').eq('review_issue_id', fixture.event.reviewIssueId)
      .order('sequence_number')
    expect(history?.map((event) => event.event_type)).toEqual(['opened', 'answered', 'resolved'])
  })

  it('rejects unsupported reasons, anonymous and cross-Business answers', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'owner')
    const other = await createUser(admin, 'other')
    for (const reason of [
      'BUSINESS_USE_UNCLEAR', 'MIXED_USE_CLARIFICATION',
      'TRANSACTION_TYPE_UNCLEAR', 'CONFLICTING_EVIDENCE',
    ] as const) {
      const unsupported = await createPurposeIssue({
        admin, ...owner, suffix: `unsupported-${reason}`, reason,
      })
      await expect(answerBusinessPurposeReviewIssue(
        answerInput(owner.customer, unsupported)
      )).rejects.toThrow('not implemented')
    }
    const owned = await createPurposeIssue({ admin, ...owner, suffix: 'owned' })
    await expect(answerBusinessPurposeReviewIssue(
      answerInput(other.customer, owned)
    )).rejects.toThrow()
    await expect(answerBusinessPurposeReviewIssue({
      ...answerInput(client(anonKey!), owned),
    })).rejects.toThrow('authenticated user')
  })

  it('rejects stale event, decision, context, and evidence without partial writes', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'stale')
    const trusted = new CanonicalWeeklyReviewService(new SupabaseBookkeepingRepository(admin))

    const staleLeaf = await createPurposeIssue({ admin, ...owner, suffix: 'leaf' })
    await trusted.resolveIssue({
      businessId: owner.businessId, issueId: staleLeaf.event.reviewIssueId,
      expectedCurrentEventId: staleLeaf.event.id,
    })
    await expect(answerBusinessPurposeReviewIssue(
      answerInput(owner.customer, staleLeaf)
    )).rejects.toThrow('current review event changed')

    const staleDecision = await createPurposeIssue({ admin, ...owner, suffix: 'decision' })
    await applyAutomatedBookkeepingDecision({
      repository: new SupabaseBookkeepingRepository(admin),
      businessId: owner.businessId, recordId: staleDecision.record.id,
      expectedCurrentDecisionId: staleDecision.decision.id,
      proposal: {
        bookkeepingNature: 'expense', treatment: 'business', reviewStatus: 'needs_review',
        confidence: 0.92, reason: 'New current decision.', businessPurpose: null,
        allocations: [{ kind: 'business', amountCents: -4321 }],
        basis: { evidenceSufficient: true, ruleKey: 'new-rule', ruleAllowed: true,
          businessPurposeSupported: false, mixedUseAllocationSupported: false },
      },
    })
    await expect(answerBusinessPurposeReviewIssue(
      answerInput(owner.customer, staleDecision)
    )).rejects.toThrow('current bookkeeping decision changed')

    const staleContext = await createPurposeIssue({ admin, ...owner, suffix: 'context' })
    await expect(answerBusinessPurposeReviewIssue({
      ...answerInput(owner.customer, staleContext),
      expectedContextFingerprint: 'wrong-context',
    })).rejects.toThrow('context changed')
    const staleEvidence = await createPurposeIssue({ admin, ...owner, suffix: 'evidence' })
    await expect(answerBusinessPurposeReviewIssue({
      ...answerInput(owner.customer, staleEvidence),
      expectedEvidenceFingerprint: 'wrong-evidence',
    })).rejects.toThrow('evidence context changed')

    for (const fixture of [staleDecision, staleContext, staleEvidence]) {
      const { count } = await admin.from('bookkeeping_review_events')
        .select('*', { count: 'exact', head: true })
        .eq('review_issue_id', fixture.event.reviewIssueId)
      expect(count).toBe(1)
    }
  })

  it('allows exactly one concurrent answer and preserves append-only history', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'concurrent')
    const fixture = await createPurposeIssue({ admin, ...owner, suffix: 'concurrent' })
    const results = await Promise.allSettled([
      answerBusinessPurposeReviewIssue(answerInput(owner.customer, fixture, 'Client lunch')),
      answerBusinessPurposeReviewIssue(answerInput(owner.customer, fixture, 'Client lunch')),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const { data: history } = await admin.from('bookkeeping_review_events')
      .select('id').eq('review_issue_id', fixture.event.reviewIssueId)
    expect(history).toHaveLength(3)
    const { error: updateError } = await admin.from('bookkeeping_review_events')
      .update({ answer_payload: { schemaVersion: 1, businessPurpose: 'Changed' } })
      .eq('review_issue_id', fixture.event.reviewIssueId)
    const { error: deleteError } = await admin.from('bookkeeping_decisions')
      .delete().eq('id', fixture.decision.id)
    expect(updateError).not.toBeNull()
    expect(deleteError).not.toBeNull()
  })
})
