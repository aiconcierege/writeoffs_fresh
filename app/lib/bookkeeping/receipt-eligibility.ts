/** Purchase receipts are not a generic documentation requirement for money-in.
 * Keep in sync with public.purchase_receipt_eligible at the mutation boundary.
 * Unknown activity must first be established as a purchase; transfers and card
 * payments never become purchases merely because their amount is negative.
 */
export function purchaseReceiptEligible(activity: {
  supportingDocumentOnly?: boolean
  amountCents: number | null
  bookkeepingNature: string | null
  treatment: string | null
}) {
  return !activity.supportingDocumentOnly && activity.amountCents != null && activity.amountCents < 0
    && activity.bookkeepingNature === 'expense'
    && ['business', 'mixed_use', 'unresolved'].includes(activity.treatment ?? '')
}
