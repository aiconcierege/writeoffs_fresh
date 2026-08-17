import { describe, expect, it } from 'vitest'
import type {
  DocumentationRepository,
} from '../../app/lib/bookkeeping/documentation-events'
import { CanonicalDocumentationService } from '../../app/lib/bookkeeping/documentation-events'
import type {
  ReceiptLostResult,
  StoredDocumentationEvent,
} from '../../app/lib/bookkeeping/documentation-model'

class MemoryDocumentationRepository implements DocumentationRepository {
  events: StoredDocumentationEvent[] = []

  private current(issueId: string) {
    const history = this.events.filter((event) => event.documentationIssueId === issueId)
    const predecessors = new Set(history.map((event) => event.supersedesEventId).filter(Boolean))
    return history.find((event) => !predecessors.has(event.id))!
  }

  async openDocumentationRequest(input: Parameters<DocumentationRepository['openDocumentationRequest']>[0]) {
    const root = this.events.find((event) => event.businessId === input.businessId &&
      event.bookkeepingRecordId === input.recordId && event.reason === input.reason &&
      event.issueKey === input.issueKey && event.eventType === 'request_opened')
    if (root) return this.current(root.documentationIssueId)
    const id = `documentation-${this.events.length + 1}`
    const event: StoredDocumentationEvent = {
      id, businessId: input.businessId, bookkeepingRecordId: input.recordId,
      documentationIssueId: id, supersedesEventId: null, sequenceNumber: 1,
      eventType: 'request_opened', reason: input.reason,
      issueKey: input.issueKey, contextFingerprint: input.contextFingerprint,
      evidenceFingerprint: 'evidence:v1', questionContext: input.questionContext,
      assertionPayload: null, provenance: 'automation', actorUserId: null,
      createdAt: new Date().toISOString(),
    }
    this.events.push(event)
    return event
  }

  async markReceiptLost(
    _input: Parameters<DocumentationRepository['markReceiptLost']>[0]
  ): Promise<ReceiptLostResult> {
    void _input
    throw new Error('not used')
  }
  async reopenDocumentationRequest(
    _input: Parameters<DocumentationRepository['reopenDocumentationRequest']>[0]
  ): Promise<StoredDocumentationEvent> {
    void _input
    throw new Error('not used')
  }
  async listOutstandingDocumentationRequests(businessId: string) {
    return this.events.filter((event) => event.businessId === businessId &&
      this.current(event.documentationIssueId).id === event.id &&
      ['request_opened', 'reopened'].includes(event.eventType))
  }
}

describe('canonical documentation service', () => {
  it('opens one idempotent typed request without using Weekly Review state', async () => {
    const repository = new MemoryDocumentationRepository()
    const service = new CanonicalDocumentationService(repository)
    const input = {
      businessId: 'business-1', recordId: 'record-1',
      reason: 'MISSING_SUPPORTING_DOCUMENTATION', issueKey: 'receipt:v1',
      contextFingerprint: 'context:v1', questionContext: {
        schemaVersion: 1, reason: 'MISSING_SUPPORTING_DOCUMENTATION',
      },
    }
    const first = await service.openRequest(input)
    const repeated = await service.openRequest(input)
    expect(repeated.id).toBe(first.id)
    expect(repository.events).toHaveLength(1)
    expect(await service.listOutstanding('business-1')).toEqual([first])
  })
})
