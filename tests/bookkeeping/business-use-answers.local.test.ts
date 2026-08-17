import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { applyAutomatedBookkeepingDecision } from '../../app/lib/bookkeeping/agent-resolution'
import {
  answerBusinessUseReviewIssue,
  answerMixedUseReviewIssue,
} from '../../app/lib/bookkeeping/review-answer-workflow'
import { CanonicalWeeklyReviewService } from '../../app/lib/bookkeeping/review-events'
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
  const email = `use-${label}-${crypto.randomUUID()}@example.test`
  const password = 'local-use-password'
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('local user creation failed')
  const customer = client(anonKey!)
  const { error: signInError } = await customer.auth.signInWithPassword({
    email, password,
  })
  if (signInError) throw signInError
  const { data: business, error: businessError } = await admin
    .from('businesses').select('id').eq('owner_user_id', data.user.id).single()
  if (businessError) throw businessError
  return { customer, userId: data.user.id, businessId: business.id as string }
}

async function createBusinessUseIssue(input: {
  admin: SupabaseClient
  customer: SupabaseClient
  businessId: string
  suffix: string
  amountCents: number
  knownNature: boolean
  reason?: 'BUSINESS_USE_UNCLEAR' | 'BUSINESS_PURPOSE_NEEDED'
}) {
  const trustedRepository = new SupabaseBookkeepingRepository(input.admin)
  const customerRepository = new SupabaseBookkeepingRepository(input.customer)
  const record = await trustedRepository.ensureRecord({
    actor: { businessId: input.businessId, userId: null, provenance: 'automation' },
    record: {
      sourceKind: 'manual', financialTransactionId: null,
      ingestionKey: `business-use:${input.suffix}:${crypto.randomUUID()}`,
      amountCents: input.amountCents, currency: 'USD', occurredOn: '2026-08-17',
    },
  })
  const initial = await customerRepository.ensureInitialUnresolvedDecision(
    input.businessId, record.id
  )
  const decision = input.knownNature
    ? await applyAutomatedBookkeepingDecision({
        repository: trustedRepository,
        businessId: input.businessId,
        recordId: record.id,
        expectedCurrentDecisionId: initial.id,
        proposal: {
          bookkeepingNature: 'expense', treatment: 'unresolved',
          reviewStatus: 'needs_review', confidence: 0.72,
          reason: 'The use of this activity is unclear.', businessPurpose: null,
          allocations: [],
          basis: {
            evidenceSufficient: false, ruleKey: null, ruleAllowed: false,
            businessPurposeSupported: false, mixedUseAllocationSupported: false,
          },
        },
      })
    : initial
  const reason = input.reason ?? 'BUSINESS_USE_UNCLEAR'
  const event = await new CanonicalWeeklyReviewService(trustedRepository).openIssue({
    businessId: input.businessId, recordId: record.id, decisionId: decision.id,
    reason, issueKey: `business-use:${input.suffix}`,
    contextFingerprint: `business-use:${input.suffix}:v1`,
    questionContext: { schemaVersion: 1, reason },
  })
  if (!event.evidenceFingerprint) throw new Error('evidence fingerprint missing')
  return { record, initial, decision, event }
}

function answerInput(
  customer: SupabaseClient,
  fixture: Awaited<ReturnType<typeof createBusinessUseIssue>>,
  use: 'business' | 'personal' | 'mixed'
) {
  return {
    supabase: customer,
    reviewIssueId: fixture.event.reviewIssueId,
    expectedCurrentEventId: fixture.event.id,
    expectedCurrentDecisionId: fixture.decision.id,
    expectedContextFingerprint: fixture.event.contextFingerprint,
    expectedEvidenceFingerprint: fixture.event.evidenceFingerprint!,
    answer: { schemaVersion: 1 as const, use },
  }
}

function mixedInput(
  customer: SupabaseClient,
  result: Awaited<ReturnType<typeof answerBusinessUseReviewIssue>>,
  businessAmountCents: number
) {
  if (!result.followUpEvent) throw new Error('mixed-use follow-up missing')
  return {
    supabase: customer,
    reviewIssueId: result.followUpEvent.reviewIssueId,
    expectedCurrentEventId: result.followUpEvent.id,
    expectedCurrentDecisionId: result.decision.id,
    expectedContextFingerprint: result.followUpEvent.contextFingerprint,
    expectedEvidenceFingerprint: result.followUpEvent.evidenceFingerprint!,
    answer: { schemaVersion: 1 as const, businessAmountCents },
  }
}

describe.skipIf(!runLocal)('canonical business-use answers on local Supabase', () => {
  it('completes Business and Personal with full signed allocations', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'complete')
    for (const [use, amount, kind] of [
      ['business', -18600, 'business'],
      ['personal', 18600, 'personal'],
    ] as const) {
      const fixture = await createBusinessUseIssue({
        admin, ...owner, suffix: use, amountCents: amount, knownNature: true,
      })
      const result = await answerBusinessUseReviewIssue(
        answerInput(owner.customer, fixture, use)
      )
      expect(result.decision).toMatchObject({
        bookkeepingNature: 'expense', treatment: use,
        reviewStatus: 'resolved', provenance: 'user', confidence: null,
        allocations: [{ kind, amountCents: amount }],
      })
      expect(result.followUpEvent).toBeNull()
      expect(result.answeredEvent.answerPayload).toEqual({ schemaVersion: 1, use })
      expect(result.resolvedEvent.eventType).toBe('resolved')
    }
  })

  it('opens only the required typed follow-ups without partial allocations', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'follow-up')
    for (const use of ['business', 'personal'] as const) {
      const fixture = await createBusinessUseIssue({
        admin, ...owner, suffix: `unknown-${use}`, amountCents: -18600,
        knownNature: false,
      })
      const result = await answerBusinessUseReviewIssue(
        answerInput(owner.customer, fixture, use)
      )
      expect(result.decision).toMatchObject({
        bookkeepingNature: null, treatment: 'unresolved', allocations: [],
        provenance: 'user', confidence: null,
      })
      expect(result.followUpEvent?.reason).toBe('TRANSACTION_TYPE_UNCLEAR')
    }

    const mixed = await createBusinessUseIssue({
      admin, ...owner, suffix: 'mixed', amountCents: -18600, knownNature: true,
    })
    const result = await answerBusinessUseReviewIssue(
      answerInput(owner.customer, mixed, 'mixed')
    )
    expect(result.decision).toMatchObject({ treatment: 'unresolved', allocations: [] })
    expect(result.followUpEvent).toMatchObject({
      reason: 'MIXED_USE_CLARIFICATION', eventType: 'opened',
      basedOnDecisionId: result.decision.id,
    })
  })

  it('derives exact signed mixed-use allocations for negative and positive totals', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'signed')
    for (const [total, business, personal] of [
      [-18600, -12000, -6600],
      [18600, 12000, 6600],
    ] as const) {
      const fixture = await createBusinessUseIssue({
        admin, ...owner, suffix: `signed-${total}`, amountCents: total,
        knownNature: true,
      })
      const first = await answerBusinessUseReviewIssue(
        answerInput(owner.customer, fixture, 'mixed')
      )
      const result = await answerMixedUseReviewIssue(
        mixedInput(owner.customer, first, 12000)
      )
      expect(result.decision).toMatchObject({
        bookkeepingNature: 'expense', treatment: 'mixed_use',
        provenance: 'user', confidence: null,
      })
      expect(result.decision.allocations).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'business', amountCents: business }),
        expect.objectContaining({ kind: 'personal', amountCents: personal }),
      ]))
      expect(result.decision.allocations.reduce(
        (sum, allocation) => sum + allocation.amountCents, 0
      )).toBe(total)
      expect(result.followUpEvent).toBeNull()
    }
  })

  it('preserves both dollar facts and opens transaction type when nature is unknown', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'mixed-unknown')
    const fixture = await createBusinessUseIssue({
      admin, ...owner, suffix: 'mixed-unknown', amountCents: -18600,
      knownNature: false,
    })
    const first = await answerBusinessUseReviewIssue(
      answerInput(owner.customer, fixture, 'mixed')
    )
    const result = await answerMixedUseReviewIssue(
      mixedInput(owner.customer, first, 12000)
    )
    expect(first.answeredEvent.answerPayload).toEqual({ schemaVersion: 1, use: 'mixed' })
    expect(result.answeredEvent.answerPayload).toEqual({
      schemaVersion: 1, businessAmountCents: 12000,
    })
    expect(result.decision).toMatchObject({
      bookkeepingNature: null, treatment: 'unresolved', allocations: [],
    })
    expect(result.followUpEvent).toMatchObject({ reason: 'TRANSACTION_TYPE_UNCLEAR' })
    expect(result.followUpEvent?.questionContext).toMatchObject({
      businessUse: 'mixed', businessAmountCents: 12000,
    })
  })

  it('rejects zero, full, over-total, stale and unsupported answers atomically', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'invalid')
    for (const amount of [18600, 18601]) {
      const fixture = await createBusinessUseIssue({
        admin, ...owner, suffix: `amount-${amount}`, amountCents: -18600,
        knownNature: true,
      })
      const first = await answerBusinessUseReviewIssue(
        answerInput(owner.customer, fixture, 'mixed')
      )
      await expect(answerMixedUseReviewIssue(
        mixedInput(owner.customer, first, amount)
      )).rejects.toThrow('less than the full')
      const { count } = await admin.from('bookkeeping_review_events')
        .select('*', { count: 'exact', head: true })
        .eq('review_issue_id', first.followUpEvent!.reviewIssueId)
      expect(count).toBe(1)
    }

    const stale = await createBusinessUseIssue({
      admin, ...owner, suffix: 'stale', amountCents: -18600, knownNature: true,
    })
    await expect(answerBusinessUseReviewIssue({
      ...answerInput(owner.customer, stale, 'business'),
      expectedContextFingerprint: 'wrong',
    })).rejects.toThrow('context changed')

    const purposeFixture = await createBusinessUseIssue({
      admin, ...owner, suffix: 'wrong-reason', amountCents: -18600,
      knownNature: true, reason: 'BUSINESS_PURPOSE_NEEDED',
    })
    await expect(answerBusinessUseReviewIssue(
      answerInput(owner.customer, purposeFixture, 'business')
    )).rejects.toThrow('not implemented')
  })

  it('rejects changed decisions and evidence with no partial answer history', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'staleness')
    const repository = new SupabaseBookkeepingRepository(admin)

    const staleDecision = await createBusinessUseIssue({
      admin, ...owner, suffix: 'stale-decision', amountCents: -18600,
      knownNature: true,
    })
    await applyAutomatedBookkeepingDecision({
      repository,
      businessId: owner.businessId,
      recordId: staleDecision.record.id,
      expectedCurrentDecisionId: staleDecision.decision.id,
      proposal: {
        bookkeepingNature: 'expense', treatment: 'unresolved',
        reviewStatus: 'needs_review', confidence: 0.74,
        reason: 'Evidence was reevaluated.', businessPurpose: null,
        allocations: [],
        basis: {
          evidenceSufficient: false, ruleKey: null, ruleAllowed: false,
          businessPurposeSupported: false, mixedUseAllocationSupported: false,
        },
      },
    })
    await expect(answerBusinessUseReviewIssue(
      answerInput(owner.customer, staleDecision, 'business')
    )).rejects.toThrow('current bookkeeping decision changed')

    const staleEvidence = await createBusinessUseIssue({
      admin, ...owner, suffix: 'stale-evidence', amountCents: -18600,
      knownNature: true,
    })
    await expect(answerBusinessUseReviewIssue({
      ...answerInput(owner.customer, staleEvidence, 'business'),
      expectedEvidenceFingerprint: 'stale-evidence-fingerprint',
    })).rejects.toThrow('evidence context changed')

    for (const fixture of [staleDecision, staleEvidence]) {
      const { count } = await admin.from('bookkeeping_review_events')
        .select('*', { count: 'exact', head: true })
        .eq('review_issue_id', fixture.event.reviewIssueId)
      expect(count).toBe(1)
    }
  })

  it('enforces authentication, tenant isolation and one concurrent lifecycle', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'owner')
    const other = await createUser(admin, 'other')
    const fixture = await createBusinessUseIssue({
      admin, ...owner, suffix: 'protected', amountCents: -18600,
      knownNature: true,
    })
    await expect(answerBusinessUseReviewIssue(
      answerInput(other.customer, fixture, 'business')
    )).rejects.toThrow()
    await expect(answerBusinessUseReviewIssue({
      ...answerInput(client(anonKey!), fixture, 'business'),
    })).rejects.toThrow('authenticated user')

    const results = await Promise.allSettled([
      answerBusinessUseReviewIssue(answerInput(owner.customer, fixture, 'business')),
      answerBusinessUseReviewIssue(answerInput(owner.customer, fixture, 'business')),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const { data: history } = await admin.from('bookkeeping_review_events')
      .select('event_type').eq('review_issue_id', fixture.event.reviewIssueId)
      .order('sequence_number')
    expect(history?.map((event) => event.event_type)).toEqual([
      'opened', 'answered', 'resolved',
    ])
  })

  it('protects mixed answers across tenants and concurrent duplicate submissions', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'mixed-owner')
    const other = await createUser(admin, 'mixed-other')
    const fixture = await createBusinessUseIssue({
      admin, ...owner, suffix: 'mixed-protected', amountCents: -18600,
      knownNature: true,
    })
    const first = await answerBusinessUseReviewIssue(
      answerInput(owner.customer, fixture, 'mixed')
    )
    await expect(answerMixedUseReviewIssue(
      mixedInput(other.customer, first, 12000)
    )).rejects.toThrow()

    const command = mixedInput(owner.customer, first, 12000)
    const results = await Promise.allSettled([
      answerMixedUseReviewIssue(command),
      answerMixedUseReviewIssue(command),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const { data: history } = await admin.from('bookkeeping_review_events')
      .select('event_type').eq('review_issue_id', first.followUpEvent!.reviewIssueId)
      .order('sequence_number')
    expect(history?.map((event) => event.event_type)).toEqual([
      'opened', 'answered', 'resolved',
    ])
  })
})
