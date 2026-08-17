import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  answerBusinessUseReviewIssue,
  answerMixedUseReviewIssue,
  answerTransactionTypeReviewIssue,
} from '../../app/lib/bookkeeping/review-answer-workflow'
import { CanonicalWeeklyReviewService } from '../../app/lib/bookkeeping/review-events'
import { SupabaseBookkeepingRepository } from '../../app/lib/bookkeeping/supabase-repository'
import type { TransactionTypeAnswer } from '../../app/lib/bookkeeping/review-answer-model'

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
  const email = `type-${label}-${crypto.randomUUID()}@example.test`
  const password = 'local-type-password'
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

async function createRecord(input: {
  admin: SupabaseClient
  customer: SupabaseClient
  businessId: string
  suffix: string
  amountCents?: number
}) {
  const trusted = new SupabaseBookkeepingRepository(input.admin)
  const customer = new SupabaseBookkeepingRepository(input.customer)
  const record = await trusted.ensureRecord({
    actor: { businessId: input.businessId, userId: null, provenance: 'automation' },
    record: {
      sourceKind: 'manual', financialTransactionId: null,
      ingestionKey: `transaction-type:${input.suffix}:${crypto.randomUUID()}`,
      amountCents: input.amountCents ?? -18600,
      currency: 'USD', occurredOn: '2026-08-17',
    },
  })
  const decision = await customer.ensureInitialUnresolvedDecision(
    input.businessId, record.id
  )
  return { record, decision }
}

async function openTransactionType(input: {
  admin: SupabaseClient
  businessId: string
  recordId: string
  decisionId: string
  suffix: string
  questionContext?: Record<string, unknown>
}) {
  const event = await new CanonicalWeeklyReviewService(
    new SupabaseBookkeepingRepository(input.admin)
  ).openIssue({
    businessId: input.businessId, recordId: input.recordId,
    decisionId: input.decisionId, reason: 'TRANSACTION_TYPE_UNCLEAR',
    issueKey: `transaction-type:${input.suffix}`,
    contextFingerprint: `transaction-type:${input.suffix}:v1`,
    questionContext: input.questionContext ?? {
      schemaVersion: 1, reason: 'TRANSACTION_TYPE_UNCLEAR',
    },
  })
  if (!event.evidenceFingerprint) throw new Error('evidence fingerprint missing')
  return event
}

function transactionInput(input: {
  customer: SupabaseClient
  event: Awaited<ReturnType<typeof openTransactionType>>
  decisionId: string
  answer: TransactionTypeAnswer
}) {
  return {
    supabase: input.customer,
    reviewIssueId: input.event.reviewIssueId,
    expectedCurrentEventId: input.event.id,
    expectedCurrentDecisionId: input.decisionId,
    expectedContextFingerprint: input.event.contextFingerprint,
    expectedEvidenceFingerprint: input.event.evidenceFingerprint!,
    answer: input.answer,
  }
}

async function preparePriorUse(input: {
  admin: SupabaseClient
  customer: SupabaseClient
  businessId: string
  suffix: string
  use: 'business' | 'personal' | 'mixed'
  businessAmountCents?: number
}) {
  const base = await createRecord(input)
  const service = new CanonicalWeeklyReviewService(
    new SupabaseBookkeepingRepository(input.admin)
  )
  const useEvent = await service.openIssue({
    businessId: input.businessId, recordId: base.record.id,
    decisionId: base.decision.id, reason: 'BUSINESS_USE_UNCLEAR',
    issueKey: `prior-use:${input.suffix}`,
    contextFingerprint: `prior-use:${input.suffix}:v1`,
    questionContext: { schemaVersion: 1, reason: 'BUSINESS_USE_UNCLEAR' },
  })
  if (!useEvent.evidenceFingerprint) throw new Error('use evidence fingerprint missing')
  const useResult = await answerBusinessUseReviewIssue({
    supabase: input.customer,
    reviewIssueId: useEvent.reviewIssueId,
    expectedCurrentEventId: useEvent.id,
    expectedCurrentDecisionId: base.decision.id,
    expectedContextFingerprint: useEvent.contextFingerprint,
    expectedEvidenceFingerprint: useEvent.evidenceFingerprint,
    answer: { schemaVersion: 1, use: input.use },
  })
  if (input.use !== 'mixed') {
    if (!useResult.followUpEvent ||
      useResult.followUpEvent.reason !== 'TRANSACTION_TYPE_UNCLEAR') {
      throw new Error('transaction-type follow-up missing')
    }
    return {
      ...base, useEvent, useResult, decision: useResult.decision,
      event: useResult.followUpEvent,
    }
  }
  if (!useResult.followUpEvent ||
    useResult.followUpEvent.reason !== 'MIXED_USE_CLARIFICATION') {
    throw new Error('mixed-use follow-up missing')
  }
  if (input.businessAmountCents == null) {
    await service.resolveIssue({
      businessId: input.businessId,
      issueId: useResult.followUpEvent.reviewIssueId,
      expectedCurrentEventId: useResult.followUpEvent.id,
    })
    const event = await openTransactionType({
      admin: input.admin, businessId: input.businessId,
      recordId: base.record.id, decisionId: useResult.decision.id,
      suffix: `${input.suffix}:after-both`,
      questionContext: {
        schemaVersion: 1, reason: 'TRANSACTION_TYPE_UNCLEAR',
        originatingReviewIssueId: useEvent.reviewIssueId,
        businessUse: 'mixed',
      },
    })
    return {
      ...base, useEvent, useResult, decision: useResult.decision, event,
    }
  }
  const mixedResult = await answerMixedUseReviewIssue({
    supabase: input.customer,
    reviewIssueId: useResult.followUpEvent.reviewIssueId,
    expectedCurrentEventId: useResult.followUpEvent.id,
    expectedCurrentDecisionId: useResult.decision.id,
    expectedContextFingerprint: useResult.followUpEvent.contextFingerprint,
    expectedEvidenceFingerprint: useResult.followUpEvent.evidenceFingerprint!,
    answer: { schemaVersion: 1, businessAmountCents: input.businessAmountCents },
  })
  if (!mixedResult.followUpEvent ||
    mixedResult.followUpEvent.reason !== 'TRANSACTION_TYPE_UNCLEAR') {
    throw new Error('transaction-type follow-up after mixed amount missing')
  }
  return {
    ...base, useEvent, useResult, mixedResult,
    decision: mixedResult.decision, event: mixedResult.followUpEvent,
  }
}

describe.skipIf(!runLocal)('canonical transaction-type answers on local Supabase', () => {
  it('maps all seven semantic activities and keeps other factual-only', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'mapping')
    const cases = [
      ['earned_money', 'business_income', 'business'],
      ['moved_money', 'transfer', 'excluded'],
      ['paid_card', 'credit_card_payment', 'excluded'],
      ['received_refund', 'refund', 'unresolved'],
      ['added_own_money', 'owner_contribution', 'excluded'],
      ['borrowed_money', 'loan_proceeds', 'excluded'],
    ] as const
    for (const [activity, nature, treatment] of cases) {
      const base = await createRecord({ admin, ...owner, suffix: activity })
      const event = await openTransactionType({
        admin, businessId: owner.businessId, recordId: base.record.id,
        decisionId: base.decision.id, suffix: activity,
      })
      const result = await answerTransactionTypeReviewIssue(transactionInput({
        customer: owner.customer, event, decisionId: base.decision.id,
        answer: { schemaVersion: 1, activity },
      }))
      expect(result.decision).toMatchObject({
        bookkeepingNature: nature, treatment, provenance: 'user', confidence: null,
      })
      if (treatment === 'excluded') {
        expect(result.decision.allocations).toEqual([
          expect.objectContaining({ kind: 'excluded', amountCents: -18600 }),
        ])
      }
      if (activity === 'received_refund') {
        expect(result.decision.allocations).toEqual([])
        expect(result.followUpEvent).toBeNull()
      }
    }

    const otherBase = await createRecord({ admin, ...owner, suffix: 'other' })
    const otherEvent = await openTransactionType({
      admin, businessId: owner.businessId, recordId: otherBase.record.id,
      decisionId: otherBase.decision.id, suffix: 'other',
    })
    const other = await answerTransactionTypeReviewIssue(transactionInput({
      customer: owner.customer, event: otherEvent,
      decisionId: otherBase.decision.id,
      answer: {
        schemaVersion: 1, activity: 'other',
        details: '  Insurance proceeds from damaged equipment  ',
      },
    }))
    expect(other.decision).toMatchObject({
      bookkeepingNature: null, treatment: 'unresolved', allocations: [],
    })
    expect(other.answeredEvent.answerPayload).toEqual({
      schemaVersion: 1, activity: 'other',
      details: 'Insurance proceeds from damaged equipment',
    })
    expect(other.followUpEvent).toBeNull()
  })

  it('opens Business Use for a purchase with no prior use answer', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'no-use')
    const base = await createRecord({ admin, ...owner, suffix: 'no-use' })
    const event = await openTransactionType({
      admin, businessId: owner.businessId, recordId: base.record.id,
      decisionId: base.decision.id, suffix: 'no-use',
    })
    const result = await answerTransactionTypeReviewIssue(transactionInput({
      customer: owner.customer, event, decisionId: base.decision.id,
      answer: { schemaVersion: 1, activity: 'purchase' },
    }))
    expect(result.decision).toMatchObject({
      bookkeepingNature: 'expense', treatment: 'unresolved', allocations: [],
    })
    expect(result.followUpEvent).toMatchObject({ reason: 'BUSINESS_USE_UNCLEAR' })
  })

  it('reuses immutable Business and Personal answers for purchases', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'use-reuse')
    for (const use of ['business', 'personal'] as const) {
      const prior = await preparePriorUse({
        admin, ...owner, suffix: use, use,
      })
      const result = await answerTransactionTypeReviewIssue(transactionInput({
        customer: owner.customer, event: prior.event,
        decisionId: prior.decision.id,
        answer: { schemaVersion: 1, activity: 'purchase' },
      }))
      expect(result.decision).toMatchObject({
        bookkeepingNature: 'expense', treatment: use,
        allocations: [expect.objectContaining({ kind: use, amountCents: -18600 })],
      })
      expect(result.followUpEvent).toBeNull()
    }
  })

  it('reuses Both and its dollar answer without asking again', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'mixed-reuse')
    const prior = await preparePriorUse({
      admin, ...owner, suffix: 'mixed-reuse', use: 'mixed',
      businessAmountCents: 12000,
    })
    const result = await answerTransactionTypeReviewIssue(transactionInput({
      customer: owner.customer, event: prior.event,
      decisionId: prior.decision.id,
      answer: { schemaVersion: 1, activity: 'purchase' },
    }))
    expect(result.decision).toMatchObject({
      bookkeepingNature: 'expense', treatment: 'mixed_use',
    })
    expect(result.decision.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'business', amountCents: -12000 }),
      expect.objectContaining({ kind: 'personal', amountCents: -6600 }),
    ]))
    expect(result.followUpEvent).toBeNull()
  })

  it('opens Mixed Use when Both is known but its dollar amount is not', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'mixed-missing')
    const prior = await preparePriorUse({
      admin, ...owner, suffix: 'mixed-missing', use: 'mixed',
    })
    const result = await answerTransactionTypeReviewIssue(transactionInput({
      customer: owner.customer, event: prior.event,
      decisionId: prior.decision.id,
      answer: { schemaVersion: 1, activity: 'purchase' },
    }))
    expect(result.decision).toMatchObject({
      bookkeepingNature: 'expense', treatment: 'unresolved', allocations: [],
    })
    expect(result.followUpEvent).toMatchObject({
      reason: 'MIXED_USE_CLARIFICATION',
      questionContext: expect.objectContaining({ businessUse: 'mixed' }),
    })
  })

  it('preserves conflict histories for earned money after Personal', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'conflict')
    const prior = await preparePriorUse({
      admin, ...owner, suffix: 'conflict', use: 'personal',
    })
    const result = await answerTransactionTypeReviewIssue(transactionInput({
      customer: owner.customer, event: prior.event,
      decisionId: prior.decision.id,
      answer: { schemaVersion: 1, activity: 'earned_money' },
    }))
    expect(prior.useResult.answeredEvent.answerPayload).toEqual({
      schemaVersion: 1, use: 'personal',
    })
    expect(result.decision).toMatchObject({
      bookkeepingNature: 'business_income', treatment: 'unresolved',
      allocations: [],
    })
    expect(result.followUpEvent).toMatchObject({ reason: 'CONFLICTING_EVIDENCE' })
  })

  it('rejects stale, cross-tenant, anonymous, and concurrent duplicate answers', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'protected')
    const other = await createUser(admin, 'other-tenant')
    const base = await createRecord({ admin, ...owner, suffix: 'protected' })
    const event = await openTransactionType({
      admin, businessId: owner.businessId, recordId: base.record.id,
      decisionId: base.decision.id, suffix: 'protected',
    })
    const command = transactionInput({
      customer: owner.customer, event, decisionId: base.decision.id,
      answer: { schemaVersion: 1, activity: 'moved_money' },
    })
    await expect(answerTransactionTypeReviewIssue({
      ...command, supabase: other.customer,
    })).rejects.toThrow()
    await expect(answerTransactionTypeReviewIssue({
      ...command, supabase: client(anonKey!),
    })).rejects.toThrow('authenticated user')
    await expect(answerTransactionTypeReviewIssue({
      ...command, expectedContextFingerprint: 'stale',
    })).rejects.toThrow('context changed')
    await expect(answerTransactionTypeReviewIssue({
      ...command, expectedEvidenceFingerprint: 'stale',
    })).rejects.toThrow('evidence context changed')

    const staleEventBase = await createRecord({
      admin, ...owner, suffix: 'stale-event',
    })
    const staleEvent = await openTransactionType({
      admin, businessId: owner.businessId, recordId: staleEventBase.record.id,
      decisionId: staleEventBase.decision.id, suffix: 'stale-event',
    })
    await new CanonicalWeeklyReviewService(
      new SupabaseBookkeepingRepository(admin)
    ).resolveIssue({
      businessId: owner.businessId, issueId: staleEvent.reviewIssueId,
      expectedCurrentEventId: staleEvent.id,
    })
    await expect(answerTransactionTypeReviewIssue(transactionInput({
      customer: owner.customer, event: staleEvent,
      decisionId: staleEventBase.decision.id,
      answer: { schemaVersion: 1, activity: 'purchase' },
    }))).rejects.toThrow('current review event changed')

    const staleDecisionBase = await createRecord({
      admin, ...owner, suffix: 'stale-decision',
    })
    const staleDecisionEvent = await openTransactionType({
      admin, businessId: owner.businessId,
      recordId: staleDecisionBase.record.id,
      decisionId: staleDecisionBase.decision.id, suffix: 'stale-decision',
    })
    await new SupabaseBookkeepingRepository(owner.customer).appendDecision({
      actor: {
        businessId: owner.businessId, userId: owner.userId, provenance: 'user',
      },
      record: staleDecisionBase.record,
      supersedesDecisionId: staleDecisionBase.decision.id,
      decision: {
        bookkeepingNature: null, treatment: 'unresolved',
        reviewStatus: 'needs_review', provenance: 'user', confidence: null,
        reason: 'A later factual correction.', businessPurpose: null,
        allocations: [],
      },
    })
    await expect(answerTransactionTypeReviewIssue(transactionInput({
      customer: owner.customer, event: staleDecisionEvent,
      decisionId: staleDecisionBase.decision.id,
      answer: { schemaVersion: 1, activity: 'purchase' },
    }))).rejects.toThrow('current bookkeeping decision changed')

    const forgedPriorBase = await createRecord({
      admin, ...owner, suffix: 'forged-prior',
    })
    const forgedPriorEvent = await openTransactionType({
      admin, businessId: owner.businessId, recordId: forgedPriorBase.record.id,
      decisionId: forgedPriorBase.decision.id, suffix: 'forged-prior',
      questionContext: {
        schemaVersion: 1, reason: 'TRANSACTION_TYPE_UNCLEAR',
        businessUse: 'business',
      },
    })
    await expect(answerTransactionTypeReviewIssue(transactionInput({
      customer: owner.customer, event: forgedPriorEvent,
      decisionId: forgedPriorBase.decision.id,
      answer: { schemaVersion: 1, activity: 'purchase' },
    }))).rejects.toThrow('immutable answer history')

    const results = await Promise.allSettled([
      answerTransactionTypeReviewIssue(command),
      answerTransactionTypeReviewIssue(command),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const { data: history } = await admin.from('bookkeeping_review_events')
      .select('event_type').eq('review_issue_id', event.reviewIssueId)
      .order('sequence_number')
    expect(history?.map((item) => item.event_type)).toEqual([
      'opened', 'answered', 'resolved',
    ])
  })
})
