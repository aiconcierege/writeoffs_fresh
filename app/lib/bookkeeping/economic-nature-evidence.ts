import type { BookkeepingEvaluationSnapshot } from './deterministic-evaluator'

/** Economic nature only. No merchant table, tax election, loan split, refund
 * relationship or account ownership inferred here. These grammars describe
 * complete bank narratives, not words appearing anywhere in a description. */
export function assessEconomicNature(s: BookkeepingEvaluationSnapshot) {
  const origin = s.financialOrigin
  const source = s.evidence?.observations.find(o => o.fact === 'financial_origin'
    && o.source.kind === 'financial_transaction' && o.source.basis === 'observed'
    && o.source.id === origin?.transactionId && o.source.provider === origin?.kind)
  const m = s.movement
  if (!origin || !source || !s.evidence || s.sourceKind !== 'financial_transaction'
    || !m || !m.sourceCurrent || m.pending || m.financialTransactionId !== origin.transactionId
    || m.amountCents !== s.amountCents || m.currency !== s.currency || m.occurredOn !== s.occurredOn
    || s.hasOpenConflictingEvidence || s.customerFactsAuthoritative || s.currentDecision.provenance === 'user'
    || s.currentDecision.treatment !== 'unresolved' || s.currentDecision.allocations.length
    || s.evidence.receipts.some(r => r.quality === 'usable')) return null
  const text = (s.description ?? '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
  const primary = s.personalFinanceCategory?.primary?.toUpperCase()
  const detailed = s.personalFinanceCategory?.detailed?.toUpperCase()
  const highProvider = origin.kind === 'plaid' && ['HIGH', 'VERY_HIGH'].includes(origin.confidence ?? '')
  const bank = m.accountType === 'checking' || m.accountType === 'savings'
  const incoming = m.amountCents > 0
  const result = (nature: 'business_income' | 'transfer' | 'credit_card_payment' | 'refund' | 'loan_principal_payment', explanation: string) =>
    ({ nature, explanation, confidence: 0.98, sourceId: origin.transactionId })

  // Bank interest grammar + credit direction + bank account + source provenance.
  // Not loan-interest refunds, card interest charges, dividends or free-form memos.
  const interestNarrative = /^(?:(?:BANK|DEPOSIT|CREDIT) )?INTEREST (?:PAID|EARNED|CREDIT|PAYMENT)$/.test(text)
    || /^(?:CREDIT|DEPOSIT) INTEREST$/.test(text)
  const providerInterest = highProvider && primary === 'INCOME' && detailed === 'INCOME_INTEREST_EARNED'
  if (bank && incoming && s.accountUse?.designation === 'business_only'
    && (interestNarrative || providerInterest) && (!primary || primary === 'INCOME')
    && (!detailed || detailed === 'INCOME_INTEREST_EARNED')) {
    return result('business_income', 'Bank credit evidence establishes interest earned in the customer-designated business account. This records working income, not a tax-form election.')
  }

  // Explicit customer role + credit rail/direction + customer-established account
  // context. A payout, invoice number, ACH deposit or bare PAYMENT is not enough.
  if (bank && incoming && s.accountUse?.designation === 'business_only'
    && /^ACH (?:CREDIT|DEPOSIT) (?:CLIENT|CUSTOMER) PAYMENT$/.test(text)
    && (!primary || primary === 'INCOME')
    && (!detailed || detailed === 'INCOME_OTHER_INCOME')) {
    return result('business_income', 'Bank credit explicitly identifies a customer payment into the customer-designated business account.')
  }

  // Direction + named account class + masked account identifier, or high-quality
  // provider account-transfer evidence. Does not assert that accounts reconciled
  // or that the owner withdrew money. Third-party names/memos fail the grammar.
  const transfer = /^TRANSFER (FROM|TO) (?:SAVINGS|CHECKING)(?: ACCOUNT)? ([0-9]{4})$/.exec(text)
  const providerTransfer = highProvider && primary === (incoming ? 'TRANSFER_IN' : 'TRANSFER_OUT')
    && detailed === (incoming ? 'TRANSFER_IN_ACCOUNT_TRANSFER' : 'TRANSFER_OUT_ACCOUNT_TRANSFER')
  if (bank && (providerTransfer || (transfer && transfer[1] === (incoming ? 'FROM' : 'TO')
    && (!primary || primary === (incoming ? 'TRANSFER_IN' : 'TRANSFER_OUT'))
    && (!detailed || detailed === (incoming ? 'TRANSFER_IN_ACCOUNT_TRANSFER' : 'TRANSFER_OUT_ACCOUNT_TRANSFER'))))) {
    return result('transfer', 'Bank evidence identifies movement between financial accounts; no income or expense, ownership or completed reconciliation is inferred.')
  }

  const cardNarrative = bank && !incoming && /^ACH PAYMENT (?:BUSINESS )?CREDIT CARD [0-9]{4}$/.test(text)
  const providerCard = highProvider && primary === 'LOAN_PAYMENTS' && detailed === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
    && (bank && !incoming || m.accountType === 'credit_card' && incoming)
  if (providerCard || cardNarrative && (!primary || primary === 'LOAN_PAYMENTS')
    && (!detailed || detailed === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT')) {
    return result('credit_card_payment', 'Bank evidence identifies payment of a credit-card balance, not a purchase. The opposite payment side need not be present.')
  }

  if (bank && !incoming && /^LOAN PAYMENT [A-Z][A-Z0-9 ]{2,80}$/.test(text)
    && !/\b(?:REFUND|CREDIT CARD|REIMBURSEMENT|REVERSAL|NOT)\b/.test(text)
    && (!primary || primary === 'LOAN_PAYMENTS')
    && (!detailed || detailed !== 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT')) {
    return result('loan_principal_payment', 'Bank evidence identifies a loan payment. Principal, interest and business treatment require supporting loan evidence; no payment amount is expensed.')
  }

  // Recognize a return without inventing its original purchase or allocation.
  // Existing special workflow still confirms relationship and remaining facts.
  if (incoming && /^REFUND [A-Z][A-Z0-9 ]{2,80}$/.test(text)
    && !/\b(?:LOAN|TRANSFER|PAYMENT|REIMBURSEMENT|REVERSAL|NOT|PENDING)\b/.test(text)
    && (!primary || primary === 'TRANSFER_IN')
    && (!detailed || detailed === 'TRANSFER_IN_OTHER_TRANSFER_IN')) {
    return result('refund', 'Bank credit identifies a refund; its original purchase and supported allocation still need to be established.')
  }
  return null
}
