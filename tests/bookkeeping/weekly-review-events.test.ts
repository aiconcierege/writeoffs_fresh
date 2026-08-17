import { describe, expect, it } from 'vitest'
import type {
  CanonicalWeeklyReviewItem,
  StoredWeeklyReviewEvent,
  WeeklyReviewReason,
} from '../../app/lib/bookkeeping/model'
import {
  CanonicalWeeklyReviewService,
  type WeeklyReviewRepository,
} from '../../app/lib/bookkeeping/review-events'

class MemoryWeeklyReviewRepository implements WeeklyReviewRepository {
  events: StoredWeeklyReviewEvent[] = []

  private current(issueId: string) {
    const issue = this.events.filter((event) => event.reviewIssueId === issueId)
    const superseded = new Set(issue.map((event) => event.supersedesEventId).filter(Boolean))
    return issue.find((event) => !superseded.has(event.id))!
  }

  async openReviewIssue(input: {
    businessId: string; recordId: string; decisionId: string
    reason: WeeklyReviewReason; issueKey: string; contextFingerprint: string
  }) {
    const existing = this.events.find((event) =>
      event.eventType === 'opened' && event.businessId === input.businessId &&
      event.bookkeepingRecordId === input.recordId && event.reason === input.reason &&
      event.issueKey === input.issueKey
    )
    if (existing) return this.current(existing.reviewIssueId)
    const id = `issue-${this.events.length + 1}`
    const event: StoredWeeklyReviewEvent = {
      id, businessId: input.businessId, bookkeepingRecordId: input.recordId,
      reviewIssueId: id, supersedesEventId: null, sequenceNumber: 1,
      eventType: 'opened', reason: input.reason, basedOnDecisionId: input.decisionId,
      issueKey: input.issueKey, contextFingerprint: input.contextFingerprint,
      deferredUntil: null, provenance: 'automation', actorUserId: null,
      createdAt: new Date().toISOString(),
    }
    this.events.push(event)
    return event
  }

  private append(input: {
    businessId: string; issueId: string; expectedCurrentEventId: string
    type: 'skipped' | 'resolved' | 'reopened'; deferredUntil?: string | null
    decisionId?: string; fingerprint?: string; userId?: string
  }) {
    const previous = this.current(input.issueId)
    if (previous.id !== input.expectedCurrentEventId) throw new Error('current review event changed')
    if (input.type === 'reopened' && previous.eventType !== 'resolved') throw new Error('materially new context')
    if (input.type === 'reopened' && input.fingerprint === previous.contextFingerprint) throw new Error('materially new context')
    const event: StoredWeeklyReviewEvent = {
      ...previous, id: `event-${this.events.length + 1}`,
      supersedesEventId: previous.id, sequenceNumber: previous.sequenceNumber + 1,
      eventType: input.type, basedOnDecisionId: input.decisionId ?? previous.basedOnDecisionId,
      contextFingerprint: input.fingerprint ?? previous.contextFingerprint,
      deferredUntil: input.deferredUntil ?? null,
      provenance: input.type === 'skipped' ? 'user' : input.type === 'resolved' ? 'system' : 'automation',
      actorUserId: input.type === 'skipped' ? input.userId! : null,
      createdAt: new Date().toISOString(),
    }
    this.events.push(event)
    return event
  }

  async skipReviewIssue(input: Parameters<WeeklyReviewRepository['skipReviewIssue']>[0]) {
    return this.append({ ...input, type: 'skipped' })
  }
  async resolveReviewIssue(input: Parameters<WeeklyReviewRepository['resolveReviewIssue']>[0]) {
    return this.append({ ...input, type: 'resolved' })
  }
  async reopenReviewIssue(input: Parameters<WeeklyReviewRepository['reopenReviewIssue']>[0]) {
    return this.append({ ...input, type: 'reopened', decisionId: input.decisionId, fingerprint: input.contextFingerprint })
  }
  async listCurrentWeeklyReviewItems(businessId: string, asOf: string) {
    return this.events
      .filter((event) => event.businessId === businessId && this.current(event.reviewIssueId).id === event.id)
      .filter((event) => event.eventType === 'opened' || event.eventType === 'reopened' ||
        (event.eventType === 'skipped' && (!event.deferredUntil || event.deferredUntil <= asOf)))
      .map((event) => ({ event } as unknown as CanonicalWeeklyReviewItem))
  }
}

const base = {
  businessId: 'business-1', recordId: 'record-1', decisionId: 'decision-1',
  issueKey: 'business-use:v1', contextFingerprint: 'evidence:v1',
}

describe('canonical Weekly Review events', () => {
  it('accepts only the five material-question reasons', async () => {
    const repository = new MemoryWeeklyReviewRepository()
    const service = new CanonicalWeeklyReviewService(repository)
    const reasons = [
      'BUSINESS_USE_UNCLEAR', 'BUSINESS_PURPOSE_NEEDED', 'MIXED_USE_CLARIFICATION',
      'TRANSACTION_TYPE_UNCLEAR', 'CONFLICTING_EVIDENCE',
    ] as const
    for (const reason of reasons) {
      await expect(service.openIssue({ ...base, reason, issueKey: reason })).resolves.toMatchObject({ reason })
    }
    await expect(service.openIssue({ ...base, reason: 'GENERIC_APPROVAL' })).rejects.toThrow('not supported')
    await expect(service.openIssue({ ...base, reason: 'SELECT_CATEGORY' })).rejects.toThrow('not supported')
  })

  it('opens idempotently and queues only typed current leaves', async () => {
    const repository = new MemoryWeeklyReviewRepository()
    const service = new CanonicalWeeklyReviewService(repository)
    expect(await service.listQueue(base.businessId)).toEqual([])
    const [first, repeated] = await Promise.all([
      service.openIssue({ ...base, reason: 'BUSINESS_USE_UNCLEAR' }),
      service.openIssue({ ...base, reason: 'BUSINESS_USE_UNCLEAR' }),
    ])
    expect(first.id).toBe(repeated.id)
    expect(repository.events).toHaveLength(1)
    expect((await service.listQueue(base.businessId))[0].event.id).toBe(first.id)
  })

  it('keeps skips outstanding while honoring deferral', async () => {
    const repository = new MemoryWeeklyReviewRepository()
    const service = new CanonicalWeeklyReviewService(repository)
    const opened = await service.openIssue({ ...base, reason: 'BUSINESS_PURPOSE_NEEDED' })
    const skipped = await service.skipIssue({
      businessId: base.businessId, userId: 'user-1', issueId: opened.reviewIssueId,
      expectedCurrentEventId: opened.id, deferredUntil: '2030-01-01T00:00:00.000Z',
    })
    expect(await service.listQueue(base.businessId, '2029-01-01T00:00:00.000Z')).toEqual([])
    expect((await service.listQueue(base.businessId, '2031-01-01T00:00:00.000Z'))[0].event.id).toBe(skipped.id)
  })

  it('does not recreate resolved issues and requires new context to reopen', async () => {
    const repository = new MemoryWeeklyReviewRepository()
    const service = new CanonicalWeeklyReviewService(repository)
    const opened = await service.openIssue({ ...base, reason: 'CONFLICTING_EVIDENCE' })
    const resolved = await service.resolveIssue({
      businessId: base.businessId, issueId: opened.reviewIssueId,
      expectedCurrentEventId: opened.id,
    })
    expect(await service.listQueue(base.businessId)).toEqual([])
    const replay = await service.openIssue({ ...base, reason: 'CONFLICTING_EVIDENCE' })
    expect(replay.id).toBe(resolved.id)
    await expect(service.reopenIssue({
      businessId: base.businessId, issueId: opened.reviewIssueId,
      expectedCurrentEventId: resolved.id, decisionId: base.decisionId,
      contextFingerprint: base.contextFingerprint,
    })).rejects.toThrow('materially new context')
    const reopened = await service.reopenIssue({
      businessId: base.businessId, issueId: opened.reviewIssueId,
      expectedCurrentEventId: resolved.id, decisionId: base.decisionId,
      contextFingerprint: 'evidence:v2',
    })
    expect((await service.listQueue(base.businessId))[0].event.id).toBe(reopened.id)
    expect(repository.events.map((event) => event.eventType)).toEqual(['opened', 'resolved', 'reopened'])
  })
})
