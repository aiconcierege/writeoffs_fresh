import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { openConflictingEvidenceIssue } from '../../app/lib/bookkeeping/conflict-workflow'
import { answerConflictingEvidenceReviewIssue } from '../../app/lib/bookkeeping/review-answer-workflow'
import { SupabaseBookkeepingRepository } from '../../app/lib/bookkeeping/supabase-repository'
import type { ConflictOption } from '../../app/lib/bookkeeping/conflict-model'

const localUrl = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const runLocal = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' &&
  Boolean(localUrl && anonKey && serviceKey)
const client = (key: string) => createClient(localUrl!, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function user(admin: SupabaseClient, label: string) {
  const email = `conflict-${label}-${crypto.randomUUID()}@example.test`
  const password = 'local-conflict-password'
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  const customer = client(anonKey!)
  await customer.auth.signInWithPassword({ email, password })
  const { data: business } = await admin.from('businesses').select('id')
    .eq('owner_user_id', data.user!.id).single()
  return { customer, businessId: business!.id as string, userId: data.user!.id }
}

async function record(admin: SupabaseClient, customer: SupabaseClient, businessId: string) {
  const trusted = new SupabaseBookkeepingRepository(admin)
  const customerRepo = new SupabaseBookkeepingRepository(customer)
  const created = await trusted.ensureRecord({
    actor: { businessId, userId: null, provenance: 'automation' },
    record: { sourceKind: 'manual', financialTransactionId: null,
      ingestionKey: `conflict:${crypto.randomUUID()}`, amountCents: -10000,
      currency: 'USD', occurredOn: '2026-08-17' },
  })
  const decision = await customerRepo.ensureInitialUnresolvedDecision(businessId, created.id)
  return { created, decision }
}

function candidate(treatment: 'business' | 'personal' | 'unresolved' = 'business') {
  return {
    bookkeepingNature: treatment === 'unresolved' ? null : 'expense' as const,
    treatment,
    reviewStatus: treatment === 'unresolved' ? 'needs_review' as const : 'resolved' as const,
    confidence: null, reason: 'Selected factual interpretation.', businessPurpose: null,
    allocations: treatment === 'unresolved' ? [] : [{
      kind: treatment, amountCents: -10000, taxCategoryKey: null, memo: null,
    }],
  }
}

function options(recordId: string, overrides?: Partial<ConflictOption>[]): ConflictOption[] {
  const base: ConflictOption[] = [
    { optionId: 'first_factual_interpretation', factualMeaning: 'This was a business purchase.',
      evidenceRefs: [{ kind: 'bookkeeping_record', id: recordId, role: 'primary activity' }],
      outcome: { type: 'APPLY_VALIDATED_CANDIDATE', version: 1, candidate: candidate() } },
    { optionId: 'second_factual_interpretation', factualMeaning: 'This was a personal purchase.',
      evidenceRefs: [{ kind: 'bookkeeping_record', id: recordId, role: 'primary activity' }],
      outcome: { type: 'REMAIN_UNRESOLVED', version: 1 } },
  ]
  return base.map((value, index) => ({ ...value, ...(overrides?.[index] ?? {}) }))
    .sort((left, right) => left.optionId.localeCompare(right.optionId))
}

async function opened(admin: SupabaseClient, businessId: string, recordId: string,
  decisionId: string, supplied = options(recordId), allowNoneOfThese = false) {
  return openConflictingEvidenceIssue({ supabase: admin, question: {
    businessId, recordId, decisionId, conflictKey: `conflict:${crypto.randomUUID()}`,
    prompt: 'We found conflicting information. What actually happened?',
    allowNoneOfThese, options: supplied,
  } })
}

function answerInput(customer: SupabaseClient, event: Awaited<ReturnType<typeof opened>>,
  decisionId: string, answer: Record<string, unknown>) {
  return { supabase: customer, reviewIssueId: event.reviewIssueId,
    expectedCurrentEventId: event.id, expectedCurrentDecisionId: decisionId,
    expectedContextFingerprint: event.contextFingerprint,
    expectedEvidenceFingerprint: event.evidenceFingerprint!,
    expectedConflictFingerprint: event.questionContext!.conflictFingerprint as string,
    answer }
}

describe.skipIf(!runLocal)('conflicting-evidence answers on local Supabase', () => {
  it('applies a trusted candidate and permits exactly one concurrent answer', async () => {
    const admin = client(serviceKey!)
    const owner = await user(admin, 'candidate')
    const base = await record(admin, owner.customer, owner.businessId)
    const event = await opened(admin, owner.businessId, base.created.id, base.decision.id)
    const input = answerInput(owner.customer, event, base.decision.id,
      { schemaVersion: 1, optionId: 'first_factual_interpretation' })
    const outcomes = await Promise.allSettled([
      answerConflictingEvidenceReviewIssue(input), answerConflictingEvidenceReviewIssue(input),
    ])
    expect(outcomes.filter((value) => value.status === 'fulfilled')).toHaveLength(1)
    const success = outcomes.find((value) => value.status === 'fulfilled')
    if (!success || success.status !== 'fulfilled') throw new Error('answer did not succeed')
    expect(success.value.decision).toMatchObject({
      bookkeepingNature: 'expense', treatment: 'business', provenance: 'user', confidence: null,
    })
    expect(success.value.decision.allocations).toEqual([
      expect.objectContaining({ kind: 'business', amountCents: -10000 }),
    ])
  })

  it('supports copy-current, copy-prior, unresolved, and one typed follow-up', async () => {
    const admin = client(serviceKey!)
    const owner = await user(admin, 'outcomes')
    for (const outcome of [
      { type: 'COPY_CURRENT_DECISION', version: 1 },
      { type: 'REMAIN_UNRESOLVED', version: 1 },
      { type: 'OPEN_TYPED_FOLLOWUP', version: 1, candidate: candidate('unresolved'),
        followUpReason: 'BUSINESS_USE_UNCLEAR',
        followUpContext: { schemaVersion: 1, reason: 'BUSINESS_USE_UNCLEAR' } },
    ] as const) {
      const base = await record(admin, owner.customer, owner.businessId)
      const event = await opened(admin, owner.businessId, base.created.id, base.decision.id,
        options(base.created.id, [{ outcome }]))
      const result = await answerConflictingEvidenceReviewIssue(answerInput(
        owner.customer, event, base.decision.id,
        { schemaVersion: 1, optionId: 'first_factual_interpretation' }
      ))
      expect(result.decision.provenance).toBe('user')
      expect(result.followUpEvent?.reason ?? null).toBe(
        outcome.type === 'OPEN_TYPED_FOLLOWUP' ? 'BUSINESS_USE_UNCLEAR' : null
      )
    }

    const base = await record(admin, owner.customer, owner.businessId)
    const current = await new SupabaseBookkeepingRepository(owner.customer).appendDecision({
      actor: { businessId: owner.businessId, userId: owner.userId, provenance: 'user' },
      record: base.created, supersedesDecisionId: base.decision.id,
      decision: { ...candidate(), provenance: 'user' },
    })
    const copyPrior: ConflictOption['outcome'] = {
      type: 'COPY_PRIOR_DECISION', version: 1, decisionId: base.decision.id,
    }
    const event = await opened(admin, owner.businessId, base.created.id, current.id,
      options(base.created.id, [{ outcome: copyPrior,
        evidenceRefs: [{ kind: 'bookkeeping_decision', id: base.decision.id, role: 'prior interpretation' }] }]))
    const result = await answerConflictingEvidenceReviewIssue(answerInput(
      owner.customer, event, current.id,
      { schemaVersion: 1, optionId: 'first_factual_interpretation' }
    ))
    expect(result.decision).toMatchObject({ treatment: 'unresolved', provenance: 'user' })
    expect(result.decision.supersedesDecisionId).toBe(current.id)
  })

  it('enforces fallback, stale fingerprints, tenant references, and anonymous denial', async () => {
    const admin = client(serviceKey!)
    const owner = await user(admin, 'security')
    const outsider = await user(admin, 'outsider')
    const base = await record(admin, owner.customer, owner.businessId)
    const other = await record(admin, outsider.customer, outsider.businessId)
    await expect(opened(admin, owner.businessId, base.created.id, base.decision.id,
      options(base.created.id, [{ evidenceRefs: [{ kind: 'bookkeeping_record', id: other.created.id,
        role: 'foreign activity' }] }]))).rejects.toThrow(/Business boundary|record is unavailable/)

    const disabled = await opened(admin, owner.businessId, base.created.id, base.decision.id)
    await expect(answerConflictingEvidenceReviewIssue(answerInput(owner.customer, disabled,
      base.decision.id, { schemaVersion: 1, optionId: 'none_of_these', factualExplanation: 'Different.' }
    ))).rejects.toThrow(/not enabled/)

    const second = await record(admin, owner.customer, owner.businessId)
    const enabled = await opened(admin, owner.businessId, second.created.id,
      second.decision.id, options(second.created.id), true)
    const fallback = await answerConflictingEvidenceReviewIssue(answerInput(owner.customer,
      enabled, second.decision.id, { schemaVersion: 1, optionId: 'none_of_these',
        factualExplanation: '  These were separate purchases.  ' }))
    expect(fallback.decision.treatment).toBe('unresolved')
    expect(fallback.answeredEvent.answerPayload).toEqual({ schemaVersion: 1,
      optionId: 'none_of_these', factualExplanation: 'These were separate purchases.' })

    const third = await record(admin, owner.customer, owner.businessId)
    const stale = await opened(admin, owner.businessId, third.created.id, third.decision.id)
    const staleInput = answerInput(owner.customer, stale, third.decision.id,
      { schemaVersion: 1, optionId: 'first_factual_interpretation' })
    await expect(answerConflictingEvidenceReviewIssue({ ...staleInput,
      expectedConflictFingerprint: 'stale' })).rejects.toThrow(/context changed/)
    await expect(answerConflictingEvidenceReviewIssue({ ...staleInput,
      expectedContextFingerprint: 'stale' })).rejects.toThrow(/review context changed/)
    await expect(answerConflictingEvidenceReviewIssue({ ...staleInput,
      expectedEvidenceFingerprint: 'stale' }))
      .rejects.toThrow(/review context changed/)
    await expect(answerConflictingEvidenceReviewIssue({ ...staleInput,
      supabase: outsider.customer })).rejects.toThrow(/unavailable/)
    const anonymous = client(anonKey!)
    await expect(answerConflictingEvidenceReviewIssue({ ...staleInput, supabase: anonymous }))
      .rejects.toThrow(/authenticated user/)

    const fourth = await record(admin, owner.customer, owner.businessId)
    const decisionEvent = await opened(admin, owner.businessId, fourth.created.id,
      fourth.decision.id)
    await new SupabaseBookkeepingRepository(owner.customer).appendDecision({
      actor: { businessId: owner.businessId, userId: owner.userId, provenance: 'user' },
      record: fourth.created, supersedesDecisionId: fourth.decision.id,
      decision: { ...candidate(), provenance: 'user' },
    })
    await expect(answerConflictingEvidenceReviewIssue(answerInput(owner.customer,
      decisionEvent, fourth.decision.id,
      { schemaVersion: 1, optionId: 'first_factual_interpretation' }
    ))).rejects.toThrow(/decision changed/)
  })

  it('rejects malformed, duplicate, approval, and unsupported trusted options', async () => {
    const admin = client(serviceKey!)
    const owner = await user(admin, 'opening')
    const base = await record(admin, owner.customer, owner.businessId)
    await expect(opened(admin, owner.businessId, base.created.id, base.decision.id,
      [options(base.created.id)[0]])).rejects.toThrow(/at least two/)
    await expect(opened(admin, owner.businessId, base.created.id, base.decision.id,
      options(base.created.id, [{ optionId: 'same' }, { optionId: 'same' }])))
      .rejects.toThrow(/unique/)
    await expect(opened(admin, owner.businessId, base.created.id, base.decision.id,
      options(base.created.id, [{ optionId: 'approve' }])))
      .rejects.toThrow(/specific factual interpretation/)

    const second = await record(admin, owner.customer, owner.businessId)
    const refs = (first: string, related: string) => [
      { kind: 'bookkeeping_record' as const, id: first, role: 'primary activity' },
      { kind: 'bookkeeping_record' as const, id: related, role: 'related activity' },
    ].sort((left, right) => `${left.kind}:${left.id}:${left.role}`
      .localeCompare(`${right.kind}:${right.id}:${right.role}`))
    const reciprocal = await Promise.all([
      opened(admin, owner.businessId, base.created.id, base.decision.id,
        options(base.created.id, [
          { evidenceRefs: refs(base.created.id, second.created.id) },
          { evidenceRefs: refs(base.created.id, second.created.id) },
        ])),
      opened(admin, owner.businessId, second.created.id, second.decision.id,
        options(second.created.id, [
          { evidenceRefs: refs(second.created.id, base.created.id) },
          { evidenceRefs: refs(second.created.id, base.created.id) },
        ])),
    ])
    expect(reciprocal).toHaveLength(2)
  })
})
