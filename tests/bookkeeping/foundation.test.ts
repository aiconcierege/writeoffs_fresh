import { describe, expect, it } from 'vitest'
import type {
  BookkeepingActor,
  CanonicalBookkeepingRecord,
  CanonicalRecordInput,
  DocumentationLink,
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
  financialTransactionBusinesses = new Map<string, string>()
  financialSources = new Map<string, string>()
  nextId = 10

  async ensureRecord(input: { businessId: string; record: CanonicalRecordInput }) {
    const existing =
      this.records.find(
        (record) =>
          record.businessId === input.businessId &&
          (record as CanonicalBookkeepingRecord & { ingestionKey?: string })
            .ingestionKey === input.record.ingestionKey
      ) ?? null
    if (existing) return existing
    const record = {
      id: `record-${this.nextId++}`,
      businessId: input.businessId,
      amountCents: input.record.amountCents,
      currency: input.record.currency,
      ingestionKey: input.record.ingestionKey,
    }
    this.records.push(record)
    return record
  }

  async findRecord(businessId: string, recordId: string) {
    return (
      this.records.find(
        (record) => record.businessId === businessId && record.id === recordId
      ) ?? null
    )
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

  async attachFinancialSource(
    input: Parameters<BookkeepingRepository['attachFinancialSource']>[0]
  ) {
    if (
      this.financialTransactionBusinesses.get(input.financialTransactionId) !==
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

  async insertDocumentLink(
    input: Parameters<BookkeepingRepository['insertDocumentLink']>[0]
  ) {
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
    amountCents,
    currency: 'USD',
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
        decision: { treatment, reviewStatus: 'resolved', allocations: [...allocations] },
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
    repository.financialTransactionBusinesses.set('financial-1', 'business-1')
    repository.financialTransactionBusinesses.set('financial-2', 'business-2')

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
    ).rejects.toThrow('does not belong to Business')
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
