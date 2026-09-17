/** A receipt-origin record can later gain bank evidence without changing origin. */
export function attachedReceiptLabel(input: {sourceKind: string | null; hasFinancialSource?: boolean}) {
  return ['receipt', 'receipt_evidence'].includes(input.sourceKind ?? '') && !input.hasFinancialSource
    ? 'Receipt saved · No bank match yet'
    : 'Receipt attached to this transaction'
}
