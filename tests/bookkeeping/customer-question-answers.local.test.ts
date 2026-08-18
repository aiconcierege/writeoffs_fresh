import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { applyAutomatedBookkeepingDecision } from '../../app/lib/bookkeeping/agent-resolution'
import { CanonicalWeeklyReviewService } from '../../app/lib/bookkeeping/review-events'
import { SupabaseBookkeepingRepository } from '../../app/lib/bookkeeping/supabase-repository'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const runLocal = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)

function client(key: string) {
  return createClient(url!, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function user(admin: SupabaseClient, label: string) {
  const email = `question-${label}-${crypto.randomUUID()}@example.test`
  const password = 'local-question-password'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('user creation failed')
  const customer = client(anonKey!)
  const { error: signInError } = await customer.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  const { data: business, error: businessError } = await admin.from('businesses')
    .select('id').eq('owner_user_id', data.user.id).single()
  if (businessError) throw businessError
  return { customer, userId: data.user.id, businessId: business.id as string }
}

async function issue(input: {
  admin: SupabaseClient
  customer: SupabaseClient
  businessId: string
  reason: 'BUSINESS_USE_UNCLEAR' | 'BUSINESS_PURPOSE_NEEDED' | 'MIXED_USE_CLARIFICATION'
  knownNature?: boolean
}) {
  const trusted = new SupabaseBookkeepingRepository(input.admin)
  const record = await trusted.ensureRecord({
    actor: { businessId: input.businessId, userId: null, provenance: 'automation' },
    record: {
      sourceKind: 'manual', financialTransactionId: null,
      ingestionKey: `customer-question:${crypto.randomUUID()}`,
      amountCents: -18600, currency: 'USD', occurredOn: '2026-08-18',
    },
  })
  const initial = await new SupabaseBookkeepingRepository(input.customer)
    .ensureInitialUnresolvedDecision(input.businessId, record.id)
  const decision = input.knownNature
    ? await applyAutomatedBookkeepingDecision({
        repository: trusted, businessId: input.businessId, recordId: record.id,
        expectedCurrentDecisionId: initial.id,
        proposal: {
          bookkeepingNature: 'expense', treatment: 'unresolved', reviewStatus: 'needs_review',
          confidence: 0.7, reason: 'A factual answer is required.', businessPurpose: null,
          allocations: [], basis: {
            evidenceSufficient: false, ruleKey: null, ruleAllowed: false,
            businessPurposeSupported: false, mixedUseAllocationSupported: false,
          },
        },
      })
    : initial
  const event = await new CanonicalWeeklyReviewService(trusted).openIssue({
    businessId: input.businessId, recordId: record.id, decisionId: decision.id,
    reason: input.reason, issueKey: `${input.reason}:${crypto.randomUUID()}`,
    contextFingerprint: `context:${crypto.randomUUID()}`,
    questionContext: { schemaVersion: 1, reason: input.reason },
  })
  return { record, decision, event }
}

function expected(fixture: Awaited<ReturnType<typeof issue>>) {
  return {
    reviewIssueId: fixture.event.reviewIssueId,
    expectedCurrentEventId: fixture.event.id,
    expectedCurrentDecisionId: fixture.decision.id,
    expectedContextFingerprint: fixture.event.contextFingerprint,
    expectedEvidenceFingerprint: fixture.event.evidenceFingerprint!,
  }
}

describe.skipIf(!runLocal)('customer questions on local Supabase', () => {
  it('records Not sure as user history while preserving bookkeeping facts', async () => {
    const admin = client(serviceKey!)
    const owner = await user(admin, 'not-sure')
    const fixture = await issue({ admin, customer: owner.customer, businessId: owner.businessId, reason: 'BUSINESS_USE_UNCLEAR', knownNature: true })
    const result = await new SupabaseBookkeepingRepository(owner.customer)
      .answerCustomerNotSure(expected(fixture))
    expect(result.answeredEvent.answerPayload).toEqual({ schemaVersion: 1, response: 'not_sure' })
    expect(result.decision).toMatchObject({
      bookkeepingNature: fixture.decision.bookkeepingNature,
      treatment: fixture.decision.treatment,
      allocations: fixture.decision.allocations,
      provenance: 'user', confidence: null,
    })
    expect(result.resolvedEvent.eventType).toBe('resolved')
  })

  it('records all-business and personal-dollar facts with exact signed allocations', async () => {
    const admin = client(serviceKey!)
    const owner = await user(admin, 'mixed')
    const repository = new SupabaseBookkeepingRepository(owner.customer)
    const allBusiness = await issue({ admin, customer: owner.customer, businessId: owner.businessId, reason: 'MIXED_USE_CLARIFICATION', knownNature: true })
    const allResult = await repository.answerMixedUseAllBusiness(expected(allBusiness))
    expect(allResult.decision).toMatchObject({
      treatment: 'business', allocations: [{ kind: 'business', amountCents: -18600 }],
    })

    const partlyPersonal = await issue({ admin, customer: owner.customer, businessId: owner.businessId, reason: 'MIXED_USE_CLARIFICATION', knownNature: true })
    const mixedResult = await repository.answerMixedUsePersonalAmount({
      ...expected(partlyPersonal), personalAmountCents: 6600,
    })
    expect(mixedResult.decision.treatment).toBe('mixed_use')
    expect(mixedResult.decision.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'business', amountCents: -12000 }),
      expect.objectContaining({ kind: 'personal', amountCents: -6600 }),
    ]))
    expect(mixedResult.decision.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0)).toBe(-18600)
  })

  it('enforces tenant isolation and allows exactly one concurrent answer lifecycle', async () => {
    const admin = client(serviceKey!)
    const owner = await user(admin, 'owner')
    const outsider = await user(admin, 'outsider')
    const protectedIssue = await issue({ admin, customer: owner.customer, businessId: owner.businessId, reason: 'BUSINESS_USE_UNCLEAR', knownNature: true })
    await expect(new SupabaseBookkeepingRepository(outsider.customer)
      .answerCustomerNotSure(expected(protectedIssue))).rejects.toThrow(/unavailable|authenticated user/i)

    const repository = new SupabaseBookkeepingRepository(owner.customer)
    const results = await Promise.allSettled([
      repository.answerCustomerNotSure(expected(protectedIssue)),
      repository.answerCustomerNotSure(expected(protectedIssue)),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const { count } = await admin.from('bookkeeping_review_events')
      .select('*', { count: 'exact', head: true })
      .eq('review_issue_id', protectedIssue.event.reviewIssueId)
    expect(count).toBe(3)
  })

  it('defers without creating a decision or answer and remains in the continuous queue', async () => {
    const admin = client(serviceKey!)
    const owner = await user(admin, 'defer')
    const fixture = await issue({ admin, customer: owner.customer, businessId: owner.businessId, reason: 'BUSINESS_PURPOSE_NEEDED', knownNature: true })
    const repository = new SupabaseBookkeepingRepository(owner.customer)
    const before = await admin.from('bookkeeping_decisions').select('*', { count: 'exact', head: true })
      .eq('bookkeeping_record_id', fixture.record.id)
    const skipped = await new CanonicalWeeklyReviewService(repository).skipIssue({
      businessId: owner.businessId, userId: owner.userId,
      issueId: fixture.event.reviewIssueId, expectedCurrentEventId: fixture.event.id,
      deferredUntil: null,
    })
    expect(skipped).toMatchObject({ eventType: 'skipped', answerPayload: null })
    expect(await repository.listCurrentWeeklyReviewItems(
      owner.businessId, new Date().toISOString()
    )).toEqual([expect.objectContaining({
      event: expect.objectContaining({ id: skipped.id, eventType: 'skipped' }),
    })])
    const after = await admin.from('bookkeeping_decisions').select('*', { count: 'exact', head: true })
      .eq('bookkeeping_record_id', fixture.record.id)
    expect(after.count).toBe(before.count)
  })
})
