import type {
  BookkeepingActor,
  BookkeepingDecisionInput,
  CanonicalBookkeepingRecord,
  CanonicalRecordInput,
  DocumentationLink,
  FinancialSourceEvidence,
  StoredBookkeepingDecision,
} from './model'
import {
  BookkeepingValidationError,
  validateCanonicalRecordInput,
  validateBookkeepingDecision,
} from './validation'

export interface BookkeepingRepository {
  ensureRecord(input: {
    actor: BookkeepingActor
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
  findFinancialSource(
    businessId: string,
    financialTransactionId: string
  ): Promise<FinancialSourceEvidence | null>
  attachFinancialSource(input: {
    actor: BookkeepingActor
    recordId: string
    financialTransactionId: string
  }): Promise<string>
  matchFinancialSourceWithCorrection(input: {
    actor: BookkeepingActor
    record: CanonicalBookkeepingRecord
    financialSource: FinancialSourceEvidence
    supersedesDecisionId: string | null
    decision: BookkeepingDecisionInput
  }): Promise<StoredBookkeepingDecision>
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
  ensureDocumentLink(input: {
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
      actor: input.actor,
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
    validateBookkeepingDecision(record.authoritativeAmountCents, decision)

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
    const source = await this.requireFinancialSource(
      input.actor.businessId,
      input.financialTransactionId
    )
    this.assertCurrencyMatches(record, source)

    const current = await this.repository.findCurrentDecision(
      input.actor.businessId,
      input.recordId
    )
    if (current && current.treatment !== 'unresolved') {
      try {
        validateBookkeepingDecision(source.amountCents, current)
      } catch {
        throw new BookkeepingValidationError(
          'The posted amount requires an atomic matching correction.'
        )
      }
    }
    return this.repository.attachFinancialSource(input)
  }

  async matchFinancialSourceWithCorrection(input: {
    actor: BookkeepingActor
    recordId: string
    financialTransactionId: string
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
    const source = await this.requireFinancialSource(
      input.actor.businessId,
      input.financialTransactionId
    )
    this.assertCurrencyMatches(record, source)

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
    validateBookkeepingDecision(source.amountCents, decision)
    return this.repository.matchFinancialSourceWithCorrection({
      actor: input.actor,
      record,
      financialSource: source,
      supersedesDecisionId: current?.id ?? null,
      decision,
    })
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

    return this.repository.ensureDocumentLink({
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

  private async requireFinancialSource(
    businessId: string,
    financialTransactionId: string
  ) {
    const source = await this.repository.findFinancialSource(
      businessId,
      financialTransactionId
    )
    if (!source) {
      throw new BookkeepingValidationError(
        'Financial source evidence was not found for this Business.'
      )
    }
    return source
  }

  private assertCurrencyMatches(
    record: CanonicalBookkeepingRecord,
    source: FinancialSourceEvidence
  ) {
    if (record.authoritativeCurrency !== source.currency) {
      throw new BookkeepingValidationError(
        'Financial source currency must match the bookkeeping record currency.'
      )
    }
  }
}
