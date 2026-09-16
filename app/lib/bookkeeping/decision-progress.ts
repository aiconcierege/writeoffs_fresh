export type DecisionProgress = {
  state: 'organized' | 'documentation' | 'unresolved' | 'non_pnl' | 'system_pending'
  message: string
  action: { label: string; href: string } | null
}

/** Projection only: never claims a missing fact was answered. */
export function decisionProgress(input: {
  recordId: string; treatment: string | null; nature: string | null;
  category: string | null; candidate?: string | null; hasReceipt: boolean; receiptUnavailable: boolean;
  needsFact: boolean; accountUseNeeded?: boolean; amountCents: number; description: string;
}): DecisionProgress {
  const question = { label: 'Answer Betti’s question', href: `/check-in?record=${input.recordId}` }
  if (['personal', 'excluded'].includes(input.treatment ?? ''))
    return { state: 'non_pnl', message: 'This activity is not included in business income or expenses.', action: null }
  if (input.accountUseNeeded && input.treatment === 'unresolved' && input.amountCents < 0)
    return { state: 'unresolved', message: 'Tell Betti how you used the account this activity came from.',
      action: { label: 'Tell Betti about this account', href: `/check-in?record=${input.recordId}` } }
  if (input.nature === 'credit_card_payment' && input.treatment !== 'unresolved')
    return { state: 'non_pnl', message: 'Credit card payment. Not included in business income or expenses.', action: null }
  if (['refund','loan_principal_payment'].includes(input.nature??'') && input.treatment==='unresolved') return {state:'unresolved',message:input.nature==='refund'?'Betti needs the purchase or expense this money relates to.':'Send Betti the loan statement to separate principal and interest.',action:question}
  if (input.needsFact) return { state: 'unresolved', action: question,
    message: input.amountCents > 0 ? 'Betti needs to know where this money came from.'
      : input.treatment === 'unresolved' ? 'Betti needs a fact about the business use or kind of activity.'
      : !input.category ? 'Betti needs more information about what you bought.' : 'Betti needs supporting details for this purchase.' }
  if (input.treatment === 'unresolved' || (!input.category && input.nature === 'expense')) {
    const payment = /payment|transfer|loan/i.test(input.description)
    return { state: 'system_pending', message: payment
      ? 'This payment needs supporting records before Betti can finish reconciling it. No expense or deduction has been assumed.'
      : 'Betti has not finished this decision. You can review the activity and add supporting records.',
    action: { label: 'Send supporting documents', href: '/import' } }
  }
  if (input.nature === 'expense' && !input.hasReceipt) return { state: 'documentation',
    message: input.receiptUnavailable ? 'This purchase is organized. Your receipt-unavailable choice is saved.'
      : 'This purchase is organized, but the receipt is missing.', action: null }
  return { state: 'organized', message: 'The working bookkeeping is organized. Tax treatment is tracked separately.', action: null }
}
