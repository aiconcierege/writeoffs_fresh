import type { CanonicalSummaryRecord } from './financial-summary'

export type PotentialWriteoff = {
  recordId: string
  decisionId: string
  businessAmountCents: number
}

function currentDecision(record: CanonicalSummaryRecord) {
  const superseded = new Set(record.decisions
    .map((decision) => decision.supersedesDecisionId).filter(Boolean))
  const leaves = record.decisions.filter((decision) => !superseded.has(decision.id))
  if (leaves.length > 1) throw new Error('Canonical decision history must have one current leaf.')
  return leaves[0] ?? null
}

/**
 * One current canonical economic expense with an established, non-zero business
 * portion. Tax treatment, documentation, and special-treatment readiness are
 * deliberately not eligibility inputs. Mileage is not a bookkeeping record and
 * is deliberately outside this metric.
 */
export function selectPotentialWriteoffs(input: {
  records: CanonicalSummaryRecord[]
  periodStart: string
  periodEnd: string
}): PotentialWriteoff[] {
  const found: PotentialWriteoff[] = []
  for (const record of input.records) {
    if (!record.occurredOn || record.occurredOn < input.periodStart
      || record.occurredOn > input.periodEnd) continue
    const decision = currentDecision(record)
    if (!decision || decision.bookkeepingNature !== 'expense'
      || !['business', 'mixed_use'].includes(decision.treatment)) continue
    const businessAmountCents = decision.allocations
      .filter((allocation) => allocation.kind === 'business')
      .reduce((total, allocation) => total + allocation.amountCents, 0)
    // Canonical outflows are negative. A standalone credit/refund does not add a
    // writeoff; convergence/reconciliation determines the one current record.
    if (!Number.isSafeInteger(businessAmountCents) || businessAmountCents >= 0) continue
    found.push({ recordId: record.id, decisionId: decision.id,
      businessAmountCents: -businessAmountCents })
  }
  return found
}
