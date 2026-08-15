import { describe, expect, it } from 'vitest'
import type {
  BookkeepingActor,
  CanonicalBookkeepingRecord,
  CanonicalRecordInput,
  DocumentationLink,
  FinancialSourceEvidence,
  StoredBookkeepingDecision,
} from '../../app/lib/bookkeeping/model'
import {
  type BookkeepingRepository,
  CanonicalBookkeepingService,
} from '../../app/lib/bookkeeping/service'

class MemoryBookkeepingRepository implements BookkeepingRepository {
  records: CanonicalBookkeepingRecord[] = []
  decisions: StoredBookkeepingDecision[] = []
  links: DocumentationLink[] = []
  receiptBusinesses = new Map<string, string>()
  financialTransactions = new Map<string, FinancialSourceEvidence>()
  financialSources = new Map<string, string>()
  lastEnsureActor: BookkeepingActor | null = null
  nextId = 10

  async ensureRecord(input: {
    actor: BookkeepingActor
    record: CanonicalRecordInput
  }) {
    this.lastEnsureActor = input.actor
    const existing =
      this.records.find(
        (record) =>
          record.businessId === input.actor.businessId &&
          (record as CanonicalBookkeepingRecord & { ingestionKey?: string })
            .ingestionKey === input.record.ingestionKey
      ) ?? null
    if (existing) return existing
    const record = {
      id: `record-${this.nextId++}`,
      businessId: input.actor.businessId,
      authoritativeAmountCents: input.record.amountCents,
      authoritativeCurrency: input.record.currency,
      ingestionKey: input.record.ingestionKey,
    }
    this.records.push(record)
    return record
  }

  async findRecord(businessId: string, recordId: string) {
    const record =
      this.records.find(
        (candidate) =>
          candidate.businessId === businessId && candidate.id === recordId
      ) ?? null
    if (!record) return null
    const sourceId = this.financialSources.get(recordId)
    const source = sourceId ? this.financialTransactions.get(sourceId) : null
    return source
      ? {
          ...record,
          authoritativeAmountCents: source.amountCents,
          authoritativeCurrency: source.currency,
        }
      : record
  }

  async findCurrentDecision(businessId: string, recordId: string) {
    const decisions = this.decisions.filter(
      (decision) =>
        decision.businessId === businessId &&
        decision.bookkeepingRecordId === recordId
    )
    const superseded = new Set(
      decisions
        .map((decision) => decision.supersedesDecisionId)
        .filter((id): id is string => id !== null)
    )
    return decisions.find((decision) => !superseded.has(decision.id)) ?? null
  }

  async findFinancialSource(businessId: string, financialTransactionId: string) {
    const source = this.financialTransactions.get(financialTransactionId)
    return source?.businessId === businessId ? source : null
  }

  async attachFinancialSource(
    input: Parameters<BookkeepingRepository['attachFinancialSource']>[0]
  ) {
    if (
      this.financialTransactions.get(input.financialTransactionId)?.businessId !==
      input.actor.businessId
    ) {
      throw new Error('financial transaction does not belong to Business')
    }
    const existing = this.financialSources.get(input.recordId)
    if (existing && existing !== input.financialTransactionId) {
      throw new Error('record already has different financial source')
    }
    this.financialSources.set(input.recordId, input.financialTransactionId)
    return `source:${input.recordId}:${input.financialTransactionId}`
  }

  async matchFinancialSourceWithCorrection(
    input: Parameters<BookkeepingRepository['matchFinancialSourceWithCorrection']>[0]
  ) {
    const previousSource = this.financialSources.get(input.record.id)
    try {
      await this.attachFinancialSource({
        actor: input.actor,
        recordId: input.record.id,
        financialTransactionId: input.financialSource.id,
      })
      return await this.appendDecision({
        actor: input.actor,
        record: {
          ...input.record,
          authoritativeAmountCents: input.financialSource.amountCents,
          authoritativeCurrency: input.financialSource.currency,
        },
        supersedesDecisionId: input.supersedesDecisionId,
        decision: input.decision,
      })
    } catch (error) {
      if (previousSource) this.financialSources.set(input.record.id, previousSource)
      else this.financialSources.delete(input.record.id)
      throw error
    }
  }

  async appendDecision(
    input: Parameters<BookkeepingRepository['appendDecision']>[0]
  ) {
    const stored: StoredBookkeepingDecision = {
      ...input.decision,
      id: `decision-${this.nextId++}`,
      businessId: input.actor.businessId,
      bookkeepingRecordId: input.record.id,
      actorUserId: input.actor.userId,
      supersedesDecisionId: input.supersedesDecisionId,
      createdAt: new Date().toISOString(),
    }
    this.decisions.push(stored)
    return stored
  }

  async receiptBelongsToBusiness(businessId: string, receiptId: string) {
    return this.receiptBusinesses.get(receiptId) === businessId
  }

  async findActiveDocumentLink(
    businessId: string,
    recordId: string,
    receiptId: string
  ) {
    return (
      this.links.find(
        (link) =>
          link.businessId === businessId &&
          link.bookkeepingRecordId === recordId &&
          link.receiptId === receiptId &&
          link.revokedAt === null
      ) ?? null
    )
  }

  async ensureDocumentLink(
    input: Parameters<BookkeepingRepository['ensureDocumentLink']>[0]
  ) {
    const existing = await this.findActiveDocumentLink(
      input.actor.businessId,
      input.recordId,
      input.receiptId
    )
    if (existing) return existing
    const link: DocumentationLink = {
      id: `link-${this.nextId++}`,
      businessId: input.actor.businessId,
      bookkeepingRecordId: input.recordId,
      receiptId: input.receiptId,
      provenance: input.actor.provenance,
      actorUserId: input.actor.userId,
      linkedAt: new Date().toISOString(),
      revokedAt: null,
      revocationReason: null,
    }
    this.links.push(link)
    return link
  }

  async revokeDocumentLink(
    input: Parameters<BookkeepingRepository['revokeDocumentLink']>[0]
  ) {
    const link = this.links.find(
      (candidate) =>
        candidate.id === input.linkId &&
        candidate.businessId === input.actor.businessId
    )
    if (!link) throw new Error('link not found')
    link.revokedAt = new Date().toISOString()
    link.revocationReason = input.reason
    return link
  }
}

const userActor = (businessId = 'business-1'): BookkeepingActor => ({
  businessId,
  userId: `${businessId}-owner`,
  provenance: 'user',
})

function setup(amountCents: number | null = -10_000) {
  const repository = new MemoryBookkeepingRepository()
  repository.records.push({
    id: 'record-1',
    businessId: 'business-1',
    authoritativeAmountCents: amountCents,
    authoritativeCurrency: 'USD',
  })
  return { repository, service: new CanonicalBookkeepingService(repository) }
}

describe('canonical bookkeeping behavior', () => {
  it('creates canonical records idempotently per Business and ingestion key', async () => {
    const { repository, service } = setup()
    const record: CanonicalRecordInput = {
      sourceKind: 'financial_transaction',
      financialTransactionId: 'financial-1',
      ingestionKey: 'financial:financial-1',
      amountCents: -1250,
      currency: 'USD',
      occurredOn: '2026-08-14',
    }

    const first = await service.ensureRecord({ actor: userActor(), record })
    const second = await service.ensureRecord({ actor: userActor(), record })

    expect(second.id).toBe(first.id)
    expect(
      repository.records.filter(
        (row) =>
          (row as CanonicalBookkeepingRecord & { ingestionKey?: string })
            .ingestionKey === record.ingestionKey
      )
    ).toHaveLength(1)
    expect(repository.lastEnsureActor).toEqual(userActor())
  })

  it('supports the approved versioned bookkeeping natures', async () => {
    for (const bookkeepingNature of [
      'expense',
      'business_income',
      'transfer',
      'credit_card_payment',
      'refund',
      'owner_contribution',
      'loan_proceeds',
      'other_non_income',
    ] as const) {
      const { service } = setup(10_000)
      const decision = await service.recordDecision({
        actor: userActor(),
        recordId: 'record-1',
        expectedCurrentDecisionId: null,
        decision: {
          bookkeepingNature,
          treatment: 'business',
          reviewStatus: 'resolved',
          allocations: [{ kind: 'business', amountCents: 10_000 }],
        },
      })
      expect(decision.bookkeepingNature).toBe(bookkeepingNature)
    }
  })

  it('requires a bookkeeping nature only after treatment is resolved', async () => {
    const { service } = setup()
    await expect(
      service.recordDecision({
        actor: userActor(),
        recordId: 'record-1',
        expectedCurrentDecisionId: null,
        decision: {
          bookkeepingNature: null,
          treatment: 'business',
          reviewStatus: 'resolved',
          allocations: [{ kind: 'business', amountCents: -10_000 }],
        },
      })
    ).rejects.toThrow('requires a bookkeeping nature')

    await expect(
      service.recordDecision({
        actor: userActor(),
        recordId: 'record-1',
        expectedCurrentDecisionId: null,
        decision: {
          bookkeepingNature: 'dividend' as 'expense',
          treatment: 'business',
          reviewStatus: 'resolved',
          allocations: [{ kind: 'business', amountCents: -10_000 }],
        },
      })
    ).rejects.toThrow('nature is not supported')
  })

  it('rejects non-reconciling and wrong-sign allocations', async () => {
    const { service } = setup()
    const base = {
      actor: userActor(),
      recordId: 'record-1',
      expectedCurrentDecisionId: null,
    }

    await expect(
      service.recordDecision({
        ...base,
        decision: {
          bookkeepingNature: 'expense',
          treatment: 'business',
          reviewStatus: 'resolved',
          allocations: [{ kind: 'business', amountCents: -9000 }],
        },
      })
    ).rejects.toThrow('reconcile exactly')

    await expect(
      service.recordDecision({
        ...base,
        decision: {
          bookkeepingNature: 'expense',
          treatment: 'business',
          reviewStatus: 'resolved',
          allocations: [
            { kind: 'business', amountCents: -11_000 },
            { kind: 'business', amountCents: 1000 },
          ],
        },
      })
    ).rejects.toThrow('record amount sign')
  })

  it('supports business, personal, excluded, and mixed-use treatment', async () => {
    for (const [treatment, allocations] of [
      ['business', [{ kind: 'business', amountCents: -10_000 }]],
      ['personal', [{ kind: 'personal', amountCents: -10_000 }]],
      ['excluded', [{ kind: 'excluded', amountCents: -10_000 }]],
      [
        'mixed_use',
        [
          { kind: 'business', amountCents: -6000 },
          { kind: 'personal', amountCents: -4000 },
        ],
      ],
    ] as const) {
      const { service } = setup()
      const decision = await service.recordDecision({
        actor: userActor(),
        recordId: 'record-1',
        expectedCurrentDecisionId: null,
        decision: {
          bookkeepingNature: 'expense',
          treatment,
          reviewStatus: 'resolved',
          allocations: [...allocations],
        },
      })
      expect(decision.treatment).toBe(treatment)
    }
  })

  it('keeps unresolved records allocation-free and available for review', async () => {
    const { service } = setup(null)
    const decision = await service.recordDecision({
      actor: { businessId: 'business-1', userId: null, provenance: 'automation' },
      recordId: 'record-1',
      expectedCurrentDecisionId: null,
      decision: {
        bookkeepingNature: null,
        treatment: 'unresolved',
        reviewStatus: 'needs_review',
        confidence: 0.42,
        reason: 'Receipt amount could not be read.',
        allocations: [],
      },
    })

    expect(decision.reviewStatus).toBe('needs_review')
    expect(decision.provenance).toBe('automation')
    expect(decision.confidence).toBe(0.42)
  })

  it('records corrections as a non-branching append-only history', async () => {
    const { repository, service } = setup()
    const original = await service.recordDecision({
      actor: { businessId: 'business-1', userId: null, provenance: 'automation' },
      recordId: 'record-1',
      expectedCurrentDecisionId: null,
      decision: {
        bookkeepingNature: 'expense',
        treatment: 'business',
        reviewStatus: 'needs_review',
        confidence: 0.7,
        allocations: [{ kind: 'business', amountCents: -10_000 }],
      },
    })
    const correction = await service.recordDecision({
      actor: userActor(),
      recordId: 'record-1',
      expectedCurrentDecisionId: original.id,
      decision: {
        bookkeepingNature: 'expense',
        treatment: 'personal',
        reviewStatus: 'resolved',
        reason: 'Personal purchase',
        allocations: [{ kind: 'personal', amountCents: -10_000 }],
      },
    })

    expect(repository.decisions).toHaveLength(2)
    expect(repository.decisions[0]).toEqual(original)
    expect(correction.supersedesDecisionId).toBe(original.id)
    await expect(
      service.recordDecision({
        actor: userActor(),
        recordId: 'record-1',
        expectedCurrentDecisionId: original.id,
        decision: {
          bookkeepingNature: 'expense',
          treatment: 'excluded',
          reviewStatus: 'resolved',
          allocations: [{ kind: 'excluded', amountCents: -10_000 }],
        },
      })
    ).rejects.toThrow('changed; reload')
  })

  it('blocks cross-tenant record and receipt relationships', async () => {
    const { repository, service } = setup()
    repository.receiptBusinesses.set('receipt-2', 'business-2')

    await expect(
      service.recordDecision({
        actor: userActor('business-2'),
        recordId: 'record-1',
        expectedCurrentDecisionId: null,
        decision: {
          bookkeepingNature: 'expense',
          treatment: 'business',
          reviewStatus: 'resolved',
          allocations: [{ kind: 'business', amountCents: -10_000 }],
        },
      })
    ).rejects.toThrow('not found for this Business')

    await expect(
      service.linkReceipt({
        actor: userActor(),
        recordId: 'record-1',
        receiptId: 'receipt-2',
      })
    ).rejects.toThrow('not found for this Business')
  })

  it('attaches later financial evidence idempotently with tenant isolation', async () => {
    const { repository, service } = setup()
    repository.financialTransactions.set('financial-1', {
      id: 'financial-1',
      businessId: 'business-1',
      amountCents: -10_000,
      currency: 'USD',
    })
    repository.financialTransactions.set('financial-2', {
      id: 'financial-2',
      businessId: 'business-2',
      amountCents: -10_000,
      currency: 'USD',
    })

    const first = await service.attachFinancialSource({
      actor: userActor(),
      recordId: 'record-1',
      financialTransactionId: 'financial-1',
    })
    const duplicate = await service.attachFinancialSource({
      actor: userActor(),
      recordId: 'record-1',
      financialTransactionId: 'financial-1',
    })
    expect(duplicate).toBe(first)

    await expect(
      service.attachFinancialSource({
        actor: userActor(),
        recordId: 'record-1',
        financialTransactionId: 'financial-2',
      })
    ).rejects.toThrow('not found for this Business')
  })

  it('uses bank-posted amount as authoritative and corrects a differing receipt atomically', async () => {
    const { repository, service } = setup(-9_500)
    const original = await service.recordDecision({
      actor: userActor(),
      recordId: 'record-1',
      expectedCurrentDecisionId: null,
      decision: {
        bookkeepingNature: 'expense',
        treatment: 'business',
        reviewStatus: 'resolved',
        allocations: [{ kind: 'business', amountCents: -9_500 }],
      },
    })
    repository.financialTransactions.set('financial-posted', {
      id: 'financial-posted',
      businessId: 'business-1',
      amountCents: -10_000,
      currency: 'USD',
    })

    await expect(
      service.attachFinancialSource({
        actor: userActor(),
        recordId: 'record-1',
        financialTransactionId: 'financial-posted',
      })
    ).rejects.toThrow('requires an atomic matching correction')
    expect(repository.financialSources.has('record-1')).toBe(false)

    const correction = await service.matchFinancialSourceWithCorrection({
      actor: userActor(),
      recordId: 'record-1',
      financialTransactionId: 'financial-posted',
      expectedCurrentDecisionId: original.id,
      decision: {
        bookkeepingNature: 'expense',
        treatment: 'business',
        reviewStatus: 'resolved',
        reason: 'Bank-posted amount controls.',
        allocations: [{ kind: 'business', amountCents: -10_000 }],
      },
    })

    expect(repository.financialSources.get('record-1')).toBe('financial-posted')
    expect(correction.supersedesDecisionId).toBe(original.id)
    expect(correction.allocations).toEqual([
      { kind: 'business', amountCents: -10_000 },
    ])
  })

  it('rejects mismatched source currency before creating an association', async () => {
    const { repository, service } = setup()
    repository.financialTransactions.set('financial-cad', {
      id: 'financial-cad',
      businessId: 'business-1',
      amountCents: -10_000,
      currency: 'CAD',
    })

    await expect(
      service.attachFinancialSource({
        actor: userActor(),
        recordId: 'record-1',
        financialTransactionId: 'financial-cad',
      })
    ).rejects.toThrow('currency must match')
    expect(repository.financialSources.has('record-1')).toBe(false)
  })

  it('rolls back source matching if its correction cannot be appended', async () => {
    const { repository, service } = setup(-9_500)
    repository.financialTransactions.set('financial-posted', {
      id: 'financial-posted',
      businessId: 'business-1',
      amountCents: -10_000,
      currency: 'USD',
    })
    const originalAppend = repository.appendDecision.bind(repository)
    repository.appendDecision = async () => {
      throw new Error('simulated database rejection')
    }

    await expect(
      service.matchFinancialSourceWithCorrection({
        actor: userActor(),
        recordId: 'record-1',
        financialTransactionId: 'financial-posted',
        expectedCurrentDecisionId: null,
        decision: {
          bookkeepingNature: 'expense',
          treatment: 'business',
          reviewStatus: 'resolved',
          allocations: [{ kind: 'business', amountCents: -10_000 }],
        },
      })
    ).rejects.toThrow('simulated database rejection')
    expect(repository.financialSources.has('record-1')).toBe(false)
    repository.appendDecision = originalAppend
  })

  it('links documentation idempotently and revokes rather than deleting history', async () => {
    const { repository, service } = setup()
    repository.receiptBusinesses.set('receipt-1', 'business-1')

    const first = await service.linkReceipt({
      actor: userActor(),
      recordId: 'record-1',
      receiptId: 'receipt-1',
    })
    const duplicate = await service.linkReceipt({
      actor: userActor(),
      recordId: 'record-1',
      receiptId: 'receipt-1',
    })
    expect(duplicate.id).toBe(first.id)

    await service.revokeReceiptLink({
      actor: userActor(),
      recordId: 'record-1',
      receiptId: 'receipt-1',
      reason: 'Matched to the wrong expense',
    })
    expect(repository.links).toHaveLength(1)
    expect(repository.links[0].revokedAt).not.toBeNull()
    expect(repository.links[0].revocationReason).toBe('Matched to the wrong expense')
  })
})
