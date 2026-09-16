/** Working books use established business allocations, independently of receipts
 * and tax-deduction completeness. Unresolved economic/business treatment cannot
 * create income or expense. Category uncertainty does not erase an allocation. */
export function workingBusinessAllocations<T extends { kind: string }>(decision: {
  treatment: string; bookkeepingNature: string | null; allocations: T[]
} | null | undefined): T[] {
  if (!decision || !['business', 'mixed_use'].includes(decision.treatment)
    || !['expense', 'business_income'].includes(decision.bookkeepingNature ?? '')) return []
  return decision.allocations.filter(allocation => allocation.kind === 'business')
}
