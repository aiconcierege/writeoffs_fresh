import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { applyAutomatedBookkeepingDecision } from '../../app/lib/bookkeeping/agent-resolution'
import { resolveFinancialTransactionRecord } from '../../app/lib/bookkeeping/financial-transaction-workflow'
import { listCanonicalReviewQueue } from '../../app/lib/bookkeeping/review-queue'
import { CanonicalBookkeepingService } from '../../app/lib/bookkeeping/service'
import { SupabaseBookkeepingRepository } from '../../app/lib/bookkeeping/supabase-repository'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const localUrl = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const runLocal =
  process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' &&
  Boolean(localUrl && anonKey && serviceKey)

let userAClient: ReturnType<typeof client>
let userBClient: ReturnType<typeof client>
let userAId: string
let transactions: string[]

function client(key: string) {
  return createClient(localUrl!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const basis = {
  evidenceSufficient: true,
  ruleKey: 'local_approved_rule',
  ruleAllowed: true,
  businessPurposeSupported: false,
  mixedUseAllocationSupported: false,
}

describe.skipIf(!runLocal)('canonical agent decisions and review queue on local Supabase', () => {
  beforeAll(async () => {
    const admin = client(serviceKey!)
    const a = await provisionLocalCanonicalOwner({ admin, url: localUrl!, anonKey: anonKey!,
      label: 'agent-review-a', amounts: [-10_000, 5_000, -2_000, -4_000, -12_000] })
    const b = await provisionLocalCanonicalOwner({ admin, url: localUrl!, anonKey: anonKey!,
      label: 'agent-review-b', amounts: [-3_000] })
    userAClient = a.customer as ReturnType<typeof client>
    userBClient = b.customer as ReturnType<typeof client>
    userAId = a.userId
    transactions = [...a.transactionIds, ...b.transactionIds]
  })

  it('appends decisions safely and returns only current tenant review leaves', async () => {
    const a = { supabase: userAClient, user: { id: userAId } }
    const b = { supabase: userBClient }
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

    // Decision review_status is coarse bookkeeping state. Without a typed material
    // question, unresolved and needs-review decisions stay out of Weekly Review.
    expect(needsReview.reviewStatus).toBe('needs_review')
    expect(unresolved.reviewStatus).toBe('in_review')
    expect(concurrent.some((result) => result.status === 'fulfilled')).toBe(true)
    expect(await listCanonicalReviewQueue({ supabase: a.supabase })).toEqual([])
    expect(await listCanonicalReviewQueue({ supabase: b.supabase })).toEqual([])
  })
})
