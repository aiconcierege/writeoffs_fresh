import type { AutomatedDecisionProposal, StoredBookkeepingDecision } from './model'

/** Narrow exception to customer-decision protection: fill one blank category,
 * never change a supplied fact, amount, existing category, or split. */
export function isCategoryOnlyEnrichment(current: StoredBookkeepingDecision, proposal: AutomatedDecisionProposal) {
  if (proposal.basis.ruleKey !== 'bookkeeping.schedule_c.operating_expense.v1'
    || current.bookkeepingNature !== proposal.bookkeepingNature
    || current.treatment !== proposal.treatment || current.reviewStatus !== proposal.reviewStatus
    || current.businessPurpose !== proposal.businessPurpose
    || current.allocations.length !== proposal.allocations.length) return false
  const business = current.allocations.filter(a => a.kind === 'business')
  if (business.length !== 1 || business[0].taxCategoryKey != null) return false
  return current.allocations.every((before, index) => {
    const after = proposal.allocations[index]
    return before.kind === after.kind && before.amountCents === after.amountCents
      && (before.memo ?? null) === (after.memo ?? null)
      && (before.kind === 'business' ? Boolean(after.taxCategoryKey)
        : (before.taxCategoryKey ?? null) === (after.taxCategoryKey ?? null))
  })
}
