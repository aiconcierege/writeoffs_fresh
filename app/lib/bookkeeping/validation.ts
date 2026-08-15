import {
  BOOKKEEPING_NATURES,
  BOOKKEEPING_TREATMENTS,
  DECISION_PROVENANCE,
  REVIEW_STATUSES,
  type AllocationKind,
  BookkeepingAllocationInput,
  BookkeepingDecisionInput,
  BookkeepingTreatment,
  CanonicalRecordInput,
} from './model'

export class BookkeepingValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BookkeepingValidationError'
  }
}

export function validateCanonicalRecordInput(input: CanonicalRecordInput) {
  if (!input.ingestionKey.trim()) {
    throw new BookkeepingValidationError('An idempotency key is required.')
  }
  if (!/^[A-Z]{3}$/.test(input.currency)) {
    throw new BookkeepingValidationError('Currency must be a three-letter code.')
  }
  if (
    input.amountCents != null &&
    (!Number.isSafeInteger(input.amountCents) || input.amountCents === 0)
  ) {
    throw new BookkeepingValidationError(
      'Record amounts must be non-zero integer cents when known.'
    )
  }
  if (
    input.sourceKind === 'financial_transaction' &&
    !input.financialTransactionId
  ) {
    throw new BookkeepingValidationError(
      'Financial-transaction records require source evidence.'
    )
  }
  if (
    input.sourceKind !== 'financial_transaction' &&
    input.financialTransactionId
  ) {
    throw new BookkeepingValidationError(
      'Receipt and manual records cannot claim financial source evidence.'
    )
  }
}

function allocationTotal(allocations: BookkeepingAllocationInput[]) {
  return allocations.reduce((total, allocation) => total + allocation.amountCents, 0)
}

function assertKinds(
  treatment: BookkeepingTreatment,
  allocations: BookkeepingAllocationInput[]
) {
  const kinds = new Set(allocations.map((allocation) => allocation.kind))

  if (treatment === 'business' && (kinds.size !== 1 || !kinds.has('business'))) {
    throw new BookkeepingValidationError(
      'Business treatment requires only business allocations.'
    )
  }
  if (treatment === 'personal' && (kinds.size !== 1 || !kinds.has('personal'))) {
    throw new BookkeepingValidationError(
      'Personal treatment requires only personal allocations.'
    )
  }
  if (treatment === 'excluded' && (kinds.size !== 1 || !kinds.has('excluded'))) {
    throw new BookkeepingValidationError(
      'Excluded treatment requires only excluded allocations.'
    )
  }
  if (
    treatment === 'mixed_use' &&
    (!kinds.has('business') || (!kinds.has('personal') && !kinds.has('excluded')))
  ) {
    throw new BookkeepingValidationError(
      'Mixed-use treatment requires business and non-business allocations.'
    )
  }
}

export function validateBookkeepingDecision(
  recordAmountCents: number | null,
  decision: BookkeepingDecisionInput
) {
  if (!BOOKKEEPING_TREATMENTS.includes(decision.treatment)) {
    throw new BookkeepingValidationError('Bookkeeping treatment is not supported.')
  }
  if (!REVIEW_STATUSES.includes(decision.reviewStatus)) {
    throw new BookkeepingValidationError('Review status is not supported.')
  }
  if (!DECISION_PROVENANCE.includes(decision.provenance)) {
    throw new BookkeepingValidationError('Decision provenance is not supported.')
  }
  if (
    decision.bookkeepingNature !== null &&
    !BOOKKEEPING_NATURES.includes(decision.bookkeepingNature)
  ) {
    throw new BookkeepingValidationError('Bookkeeping nature is not supported.')
  }
  if (decision.provenance === 'user' && decision.confidence != null) {
    throw new BookkeepingValidationError(
      'Confidence belongs to automated decisions, not explicit user decisions.'
    )
  }
  if (
    decision.confidence != null &&
    (!Number.isFinite(decision.confidence) ||
      decision.confidence < 0 ||
      decision.confidence > 1)
  ) {
    throw new BookkeepingValidationError('Confidence must be between 0 and 1.')
  }
  if (
    decision.treatment === 'unresolved' &&
    !['needs_review', 'in_review'].includes(decision.reviewStatus)
  ) {
    throw new BookkeepingValidationError(
      'Unresolved treatment must remain in review.'
    )
  }
  if (decision.treatment !== 'unresolved' && decision.bookkeepingNature === null) {
    throw new BookkeepingValidationError(
      'A resolved decision requires a bookkeeping nature.'
    )
  }
  if (decision.treatment === 'unresolved') {
    if (decision.allocations.length !== 0) {
      throw new BookkeepingValidationError(
        'Unresolved treatment cannot have allocations.'
      )
    }
    return
  }
  if (recordAmountCents == null) {
    throw new BookkeepingValidationError(
      'A resolved decision requires a known record amount.'
    )
  }
  if (decision.allocations.length === 0) {
    throw new BookkeepingValidationError(
      'A resolved decision requires at least one allocation.'
    )
  }

  for (const allocation of decision.allocations) {
    if (
      !(['business', 'personal', 'excluded'] as AllocationKind[]).includes(
        allocation.kind
      )
    ) {
      throw new BookkeepingValidationError('Allocation kind is not supported.')
    }
    if (!Number.isSafeInteger(allocation.amountCents) || allocation.amountCents === 0) {
      throw new BookkeepingValidationError(
        'Allocation amounts must be non-zero integer cents.'
      )
    }
    if (Math.sign(allocation.amountCents) !== Math.sign(recordAmountCents)) {
      throw new BookkeepingValidationError(
        'Allocation amounts must use the record amount sign.'
      )
    }
    if (allocation.kind !== 'business' && allocation.taxCategoryKey != null) {
      throw new BookkeepingValidationError(
        'Only business allocations may have a tax category.'
      )
    }
  }

  const total = allocationTotal(decision.allocations)
  if (!Number.isSafeInteger(total) || total !== recordAmountCents) {
    throw new BookkeepingValidationError(
      'Allocations must reconcile exactly to the record amount.'
    )
  }
  assertKinds(decision.treatment, decision.allocations)
}
