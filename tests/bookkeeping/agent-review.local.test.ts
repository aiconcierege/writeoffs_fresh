import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { applyAutomatedBookkeepingDecision } from '../../app/lib/bookkeeping/agent-resolution'
import { resolveFinancialTransactionRecord } from '../../app/lib/bookkeeping/financial-transaction-workflow'
import { listCanonicalReviewQueue } from '../../app/lib/bookkeeping/review-queue'
import { CanonicalBookkeepingService } from '../../app/lib/bookkeeping/service'
import { SupabaseBookkeepingRepository } from '../../app/lib/bookkeeping/supabase-repository'

const localUrl = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const runLocal =
  process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' &&
  Boolean(localUrl && anonKey && serviceKey)

const userA = { email: 'agent-a@example.test', password: 'local-password-a' }
const userB = { email: 'agent-b@example.test', password: 'local-password-b' }
const transactions = Array.from(
  { length: 6 },
  (_, index) => `44000000-0000-0000-0000-00000000000${index + 1}`
)

function client(key: string) {
  return createClient(localUrl!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function signIn(credentials: typeof userA) {
  const supabase = client(anonKey!)
  const { data, error } = await supabase.auth.signInWithPassword(credentials)
  if (error || !data.user) throw error ?? new Error('local sign-in failed')
  return { supabase, user: data.user }
}

const basis = {
  evidenceSufficient: true,
  ruleKey: 'local_approved_rule',
  ruleAllowed: true,
  businessPurposeSupported: false,
  mixedUseAllocationSupported: false,
}

describe.skipIf(!runLocal)('canonical agent decisions and review queue on local Supabase', () => {
  it('appends decisions safely and returns only current tenant review leaves', async () => {
    const a = await signIn(userA)
    const b = await signIn(userB)
    const resolvedA = await Promise.all(
      transactions.slice(0, 5).map((financialTransactionId) =>
        resolveFinancialTransactionRecord({
          supabase: a.supabase,
          financialTransactionId,
        })
      )
    )
    const resolvedB = await resolveFinancialTransactionRecord({
      supabase: b.supabase,
      financialTransactionId: transactions[5],
    })
    expect(resolvedA.every((item) => item.decision.provenance === 'system')).toBe(true)

    const { error: crossTenantInitialError } = await a.supabase.rpc(
      'ensure_initial_bookkeeping_decision',
      {
        p_business_id: resolvedB.record.businessId,
        p_bookkeeping_record_id: resolvedB.record.id,
      }
    )
    expect(crossTenantInitialError).not.toBeNull()

    const trustedRepository = new SupabaseBookkeepingRepository(client(serviceKey!))
    await expect(
      applyAutomatedBookkeepingDecision({
        repository: trustedRepository,
        businessId: resolvedA[0].record.businessId,
        recordId: resolvedB.record.id,
        expectedCurrentDecisionId: resolvedB.decision.id,
        proposal: {
          bookkeepingNature: 'expense',
          treatment: 'business',
          reviewStatus: 'not_required',
          confidence: 0.99,
          reason: 'Cross-tenant records must be rejected.',
          allocations: [{ kind: 'business', amountCents: -3_000 }],
          basis,
        },
      })
    ).rejects.toThrow('not found for this Business')
    const automated = (
      index: number,
      proposal: Parameters<typeof applyAutomatedBookkeepingDecision>[0]['proposal']
    ) =>
      applyAutomatedBookkeepingDecision({
        repository: trustedRepository,
        businessId: resolvedA[index].record.businessId,
        recordId: resolvedA[index].record.id,
        expectedCurrentDecisionId: resolvedA[index].decision.id,
        proposal,
      })

    await automated(0, {
      bookkeepingNature: 'expense',
      treatment: 'business',
      reviewStatus: 'not_required',
      confidence: 0.97,
      reason: 'Approved evidence and rule resolve this expense.',
      allocations: [{ kind: 'business', amountCents: -10_000 }],
      basis,
    })
    const needsReview = await automated(1, {
      bookkeepingNature: 'business_income',
      treatment: 'business',
      reviewStatus: 'needs_review',
      confidence: 0.78,
      reason: 'The deposit is supported as income but still warrants attention.',
      allocations: [{ kind: 'business', amountCents: 5_000 }],
      basis,
    })
    const unresolved = await automated(2, {
      bookkeepingNature: null,
      treatment: 'unresolved',
      reviewStatus: 'in_review',
      confidence: 0.35,
      reason: 'Available evidence does not establish the transaction treatment.',
      allocations: [],
      basis: {
        ...basis,
        evidenceSufficient: false,
        ruleKey: null,
        ruleAllowed: false,
      },
    })

    const userService = new CanonicalBookkeepingService(
      new SupabaseBookkeepingRepository(a.supabase)
    )
    const userDecision = await userService.recordDecision({
      actor: {
        businessId: resolvedA[3].record.businessId,
        userId: a.user.id,
        provenance: 'user',
      },
      recordId: resolvedA[3].record.id,
      expectedCurrentDecisionId: resolvedA[3].decision.id,
      decision: {
        bookkeepingNature: 'expense',
        treatment: 'personal',
        reviewStatus: 'resolved',
        allocations: [{ kind: 'personal', amountCents: -4_000 }],
      },
    })
    await expect(
      applyAutomatedBookkeepingDecision({
        repository: trustedRepository,
        businessId: resolvedA[3].record.businessId,
        recordId: resolvedA[3].record.id,
        expectedCurrentDecisionId: userDecision.id,
        proposal: {
          bookkeepingNature: 'expense',
          treatment: 'business',
          reviewStatus: 'not_required',
          confidence: 0.99,
          reason: 'Must not override the user.',
          allocations: [{ kind: 'business', amountCents: -4_000 }],
          basis,
        },
      })
    ).rejects.toThrow('cannot silently supersede')

    const concurrentProposal = {
      bookkeepingNature: 'expense' as const,
      treatment: 'business' as const,
      reviewStatus: 'needs_review' as const,
      confidence: 0.82,
      reason: 'Concurrent local proposal.',
      allocations: [{ kind: 'business' as const, amountCents: -12_000 }],
      basis,
    }
    const concurrent = await Promise.allSettled([
      automated(4, concurrentProposal),
      automated(4, concurrentProposal),
    ])
    expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1)

    const queueA = await listCanonicalReviewQueue({ supabase: a.supabase })
    expect(queueA.map((item) => item.decision.id).sort()).toEqual(
      [
        needsReview.id,
        unresolved.id,
        (concurrent.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<typeof needsReview>).value.id,
      ].sort()
    )
    expect(queueA.some((item) => item.decision.id === resolvedA[0].decision.id)).toBe(false)
    expect(queueA.some((item) => item.decision.id === userDecision.id)).toBe(false)
    expect(queueA.some((item) => item.record.businessId === resolvedB.record.businessId)).toBe(false)

    const queueB = await listCanonicalReviewQueue({ supabase: b.supabase })
    expect(queueB).toHaveLength(1)
    expect(queueB[0].record.businessId).toBe(resolvedB.record.businessId)
  })
})
