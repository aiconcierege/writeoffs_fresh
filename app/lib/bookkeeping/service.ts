import type {
  BookkeepingActor,
  BookkeepingDecisionInput,
  CanonicalBookkeepingRecord,
  CanonicalRecordInput,
  DocumentationLink,
  StoredBookkeepingDecision,
} from './model'
import {
  BookkeepingValidationError,
  validateCanonicalRecordInput,
  validateBookkeepingDecision,
} from './validation'

export interface BookkeepingRepository {
  ensureRecord(input: {
    businessId: string
    record: CanonicalRecordInput
  }): Promise<CanonicalBookkeepingRecord>
  findRecord(
    businessId: string,
    recordId: string
  ): Promise<CanonicalBookkeepingRecord | null>
  findCurrentDecision(
    businessId: string,
    recordId: string
  ): Promise<StoredBookkeepingDecision | null>
  attachFinancialSource(input: {
    actor: BookkeepingActor
    recordId: string
    financialTransactionId: string
  }): Promise<string>
  appendDecision(input: {
    actor: BookkeepingActor
    record: CanonicalBookkeepingRecord
    supersedesDecisionId: string | null
    decision: BookkeepingDecisionInput
  }): Promise<StoredBookkeepingDecision>
  receiptBelongsToBusiness(businessId: string, receiptId: string): Promise<boolean>
  findActiveDocumentLink(
    businessId: string,
    recordId: string,
    receiptId: string
  ): Promise<DocumentationLink | null>
  insertDocumentLink(input: {
    actor: BookkeepingActor
    recordId: string
    receiptId: string
  }): Promise<DocumentationLink>
  revokeDocumentLink(input: {
    actor: BookkeepingActor
    linkId: string
    reason: string
  }): Promise<DocumentationLink>
}

function assertActor(actor: BookkeepingActor) {
  if (actor.provenance === 'user' && !actor.userId) {
    throw new BookkeepingValidationError(
      'Explicit user decisions require an authenticated user.'
    )
  }
  if (actor.provenance !== 'user' && actor.userId) {
    throw new BookkeepingValidationError(
      'Automated provenance cannot impersonate a user.'
    )
  }
}

export class CanonicalBookkeepingService {
  constructor(private readonly repository: BookkeepingRepository) {}

  async ensureRecord(input: {
    actor: BookkeepingActor
    record: CanonicalRecordInput
  }) {
    assertActor(input.actor)
    validateCanonicalRecordInput(input.record)
    return this.repository.ensureRecord({
      businessId: input.actor.businessId,
      record: input.record,
    })
  }

  async recordDecision(input: {
    actor: BookkeepingActor
    recordId: string
    expectedCurrentDecisionId: string | null
    decision: Omit<BookkeepingDecisionInput, 'provenance'>
  }) {
    assertActor(input.actor)
    const record = await this.repository.findRecord(
      input.actor.businessId,
      input.recordId
    )
    if (!record) {
      throw new BookkeepingValidationError(
        'Bookkeeping record was not found for this Business.'
      )
    }

    const current = await this.repository.findCurrentDecision(
      input.actor.businessId,
      input.recordId
    )
    if ((current?.id ?? null) !== input.expectedCurrentDecisionId) {
      throw new BookkeepingValidationError(
        'The bookkeeping decision changed; reload before saving a correction.'
      )
    }

    const decision: BookkeepingDecisionInput = {
      ...input.decision,
      provenance: input.actor.provenance,
    }
    validateBookkeepingDecision(record.amountCents, decision)

    return this.repository.appendDecision({
      actor: input.actor,
      record,
      supersedesDecisionId: current?.id ?? null,
      decision,
    })
  }

  async attachFinancialSource(input: {
    actor: BookkeepingActor
    recordId: string
    financialTransactionId: string
  }) {
    assertActor(input.actor)
    if (!input.financialTransactionId.trim()) {
      throw new BookkeepingValidationError(
        'Financial source evidence is required.'
      )
    }
    const record = await this.repository.findRecord(
      input.actor.businessId,
      input.recordId
    )
    if (!record) {
      throw new BookkeepingValidationError(
        'Bookkeeping record was not found for this Business.'
      )
    }
    return this.repository.attachFinancialSource(input)
  }

  async linkReceipt(input: {
    actor: BookkeepingActor
    recordId: string
    receiptId: string
  }) {
    assertActor(input.actor)
    const record = await this.repository.findRecord(
      input.actor.businessId,
      input.recordId
    )
    if (!record) {
      throw new BookkeepingValidationError(
        'Bookkeeping record was not found for this Business.'
      )
    }
    if (
      !(await this.repository.receiptBelongsToBusiness(
        input.actor.businessId,
        input.receiptId
      ))
    ) {
      throw new BookkeepingValidationError(
        'Receipt was not found for this Business.'
      )
    }

    const existing = await this.repository.findActiveDocumentLink(
      input.actor.businessId,
      input.recordId,
      input.receiptId
    )
    if (existing) return existing

    return this.repository.insertDocumentLink({
      actor: input.actor,
      recordId: input.recordId,
      receiptId: input.receiptId,
    })
  }

  async revokeReceiptLink(input: {
    actor: BookkeepingActor
    recordId: string
    receiptId: string
    reason: string
  }) {
    assertActor(input.actor)
    if (!input.reason.trim()) {
      throw new BookkeepingValidationError('A revocation reason is required.')
    }
    const link = await this.repository.findActiveDocumentLink(
      input.actor.businessId,
      input.recordId,
      input.receiptId
    )
    if (!link) return null
    return this.repository.revokeDocumentLink({
      actor: input.actor,
      linkId: link.id,
      reason: input.reason.trim(),
    })
  }
}
