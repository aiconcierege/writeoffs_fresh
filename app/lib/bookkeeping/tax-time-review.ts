import type { CanonicalReport } from './reporting-model'
import type { TaxTimeReviewItem } from './tax-year-readiness'

/** Consumes current canonical assessment reasons, never guesses from price or merchant. */
export function purchaseReviewItems(report: CanonicalReport): TaxTimeReviewItem[] {
  const labels = new Map(report.categoryTotals.map(row => [row.categoryKey, row.categoryLabel]))
  return report.rows.filter(row => row.businessAmountCents > 0
    && ['Business', 'Business and personal'].includes(row.treatment)
    && ['POSSIBLE_ASSET', 'POSSIBLE_CAPITAL_IMPROVEMENT'].includes(row.specialTreatmentReason ?? '')).map(row => ({
    kind: 'potential_capital_asset', title: row.merchant,
    detail: 'The recorded purchase may be equipment or other longer-term business property. You or your tax preparer may need to decide whether to deduct it this year, depreciate it, or use another applicable treatment.',
    description: row.description ?? undefined,
    occurredOn: row.occurredOn, merchant: row.merchant, amountCents: Math.abs(row.signedAmountCents),
    businessAmountCents: row.businessAmountCents, recordId: row.recordId,
    currentHandling: row.categoryKey ? labels.get(row.categoryKey) ?? 'Business purchase'
      : 'Business purchase; no current-year deduction assigned',
  }))
}
