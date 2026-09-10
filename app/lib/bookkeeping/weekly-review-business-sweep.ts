import type { WeeklyReviewTransaction } from './weekly-review'

/** The safety sweep contains exceptions to conclusions WriteOffs already made. */
export function isWeeklyBusinessExpenseSweepCandidate(item: WeeklyReviewTransaction) {
  return item.amountCents < 0
    && item.bookkeepingNature === 'expense'
    && item.treatment === 'business'
}
