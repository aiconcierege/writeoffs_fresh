export const DOCUMENTATION_REASONS = [
  'MISSING_SUPPORTING_DOCUMENTATION',
] as const

export type DocumentationReason = (typeof DOCUMENTATION_REASONS)[number]

export const DOCUMENTATION_EVENT_TYPES = [
  'request_opened',
  'receipt_lost',
  'evidence_attached',
  'resolved',
  'reopened',
] as const

export type DocumentationEventType = (typeof DOCUMENTATION_EVENT_TYPES)[number]

export type ReceiptLostAnswer = {
  schemaVersion: 1
  assertion: 'receipt_lost'
}

export type StoredDocumentationEvent = {
  id: string
  businessId: string
  bookkeepingRecordId: string
  documentationIssueId: string
  supersedesEventId: string | null
  sequenceNumber: number
  eventType: DocumentationEventType
  reason: DocumentationReason
  issueKey: string
  contextFingerprint: string
  evidenceFingerprint: string
  questionContext: Record<string, unknown> | null
  assertionPayload: Record<string, unknown> | null
  provenance: 'automation' | 'system' | 'user'
  actorUserId: string | null
  createdAt: string
}

export type ReceiptLostResult = {
  receiptLostEvent: StoredDocumentationEvent
  resolvedEvent: StoredDocumentationEvent
}
