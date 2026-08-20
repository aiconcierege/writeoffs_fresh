import type {
  AutomatedDecisionProposal,
  StoredBookkeepingDecision,
} from './model'

export const BOOKKEEPING_EVALUATOR_VERSION = 'v1' as const

export type StructuralMovementHint = 'account_transfer' | 'credit_card_payment' | null

export type MovementEvidence = {
  financialTransactionId: string
  financialAccountId: string
  accountType: 'checking' | 'savings' | 'credit_card'
  amountCents: number
  currency: string
  occurredOn: string
  sourceCurrent: boolean
  pending: boolean
  structuralHint: StructuralMovementHint
  currentDecisionNature: string | null
  currentDecisionTreatment: string | null
  currentDecisionProvenance: string | null
}

export type BookkeepingEvaluationSnapshot = {
  evaluatorVersion: typeof BOOKKEEPING_EVALUATOR_VERSION
  businessId: string
  recordId: string
  sourceKind: 'financial_transaction' | 'receipt' | 'manual'
  amountCents: number | null
  currency: string
  occurredOn: string | null
  merchantName: string | null
  description: string | null
  businessDescription: string | null
  activeDocumentCount: number
  customerAnswerCount: number
  hasOpenConflictingEvidence: boolean
  decisionHistoryLength: number
  currentDecision: StoredBookkeepingDecision
  movement: MovementEvidence | null
  movementCandidates: MovementEvidence[]
}

export type DeterministicBookkeepingRuleKey =
  | 'bookkeeping.connected_account_transfer.v1'
  | 'bookkeeping.credit_card_payment.v1'

export type DeterministicEvaluation = {
  ruleKey: DeterministicBookkeepingRuleKey
  proposal: AutomatedDecisionProposal
} | null

function daysBetween(left: string, right: string) {
  return Math.abs(
    (Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000,
  )
}

function compatiblePairs(snapshot: BookkeepingEvaluationSnapshot) {
  const movement = snapshot.movement
  if (!movement) return []
  return snapshot.movementCandidates.filter((candidate) =>
    candidate.sourceCurrent
    && !candidate.pending
    && candidate.financialAccountId !== movement.financialAccountId
    && candidate.currency === movement.currency
    && candidate.amountCents === -movement.amountCents
    && daysBetween(candidate.occurredOn, movement.occurredOn) <= 3,
  )
}

function excludedProposal(input: {
  snapshot: BookkeepingEvaluationSnapshot
  nature: 'transfer' | 'credit_card_payment'
  ruleKey: DeterministicBookkeepingRuleKey
  reason: string
}): AutomatedDecisionProposal {
  return {
    bookkeepingNature: input.nature,
    treatment: 'excluded',
    reviewStatus: 'resolved',
    confidence: 1,
    reason: input.reason,
    businessPurpose: null,
    allocations: [{
      kind: 'excluded',
      amountCents: input.snapshot.amountCents!,
      memo: input.nature === 'transfer'
        ? 'Movement between connected accounts'
        : 'Payment between connected accounts',
    }],
    basis: {
      evidenceSufficient: true,
      ruleKey: input.ruleKey,
      ruleAllowed: true,
      businessPurposeSupported: false,
      mixedUseAllocationSupported: false,
    },
  }
}

export function evaluateDeterministicBookkeeping(
  snapshot: BookkeepingEvaluationSnapshot,
): DeterministicEvaluation {
  if (snapshot.evaluatorVersion !== BOOKKEEPING_EVALUATOR_VERSION
    || snapshot.amountCents == null
    || snapshot.currentDecision.provenance === 'user'
    || snapshot.currentDecision.treatment !== 'unresolved'
    || snapshot.hasOpenConflictingEvidence
    || !snapshot.movement?.sourceCurrent
    || snapshot.movement.pending) return null

  const pairs = compatiblePairs(snapshot)
  if (pairs.length !== 1) return null
  const pair = pairs[0]
  const movement = snapshot.movement
  const accountTypes = new Set([movement.accountType, pair.accountType])
  const isCardAccountPair = accountTypes.has('credit_card')
    && (accountTypes.has('checking') || accountTypes.has('savings'))
  const hasCardPaymentEvidence = movement.structuralHint === 'credit_card_payment'
    || pair.structuralHint === 'credit_card_payment'
  const counterpartSupportsMovement = [
    'credit_card_payment', 'account_transfer',
  ].includes(movement.structuralHint ?? '') && [
    'credit_card_payment', 'account_transfer',
  ].includes(pair.structuralHint ?? '')

  if (isCardAccountPair && hasCardPaymentEvidence && counterpartSupportsMovement) {
    if (pair.currentDecisionProvenance === 'user'
      || (pair.currentDecisionTreatment !== null
        && pair.currentDecisionTreatment !== 'unresolved'
        && pair.currentDecisionNature !== 'credit_card_payment')) return null
    const ruleKey = 'bookkeeping.credit_card_payment.v1' as const
    return {
      ruleKey,
      proposal: excludedProposal({
        snapshot,
        nature: 'credit_card_payment',
        ruleKey,
        reason: 'Matched an exact payment between a connected bank account and connected credit card.',
      }),
    }
  }

  if (movement.structuralHint === 'account_transfer'
    && pair.structuralHint === 'account_transfer') {
    if (pair.currentDecisionProvenance === 'user'
      || (pair.currentDecisionTreatment !== null
        && pair.currentDecisionTreatment !== 'unresolved'
        && pair.currentDecisionNature !== 'transfer')) return null
    const ruleKey = 'bookkeeping.connected_account_transfer.v1' as const
    return {
      ruleKey,
      proposal: excludedProposal({
        snapshot,
        nature: 'transfer',
        ruleKey,
        reason: 'Matched an exact movement between two connected accounts.',
      }),
    }
  }

  return null
}

export function decisionMatchesProposal(
  decision: StoredBookkeepingDecision,
  proposal: AutomatedDecisionProposal,
) {
  if (decision.bookkeepingNature !== proposal.bookkeepingNature
    || decision.treatment !== proposal.treatment
    || decision.reviewStatus !== proposal.reviewStatus
    || decision.allocations.length !== proposal.allocations.length) return false
  return decision.allocations.every((allocation, index) => {
    const candidate = proposal.allocations[index]
    return allocation.kind === candidate.kind
      && allocation.amountCents === candidate.amountCents
      && (allocation.taxCategoryKey ?? null) === (candidate.taxCategoryKey ?? null)
  })
}
