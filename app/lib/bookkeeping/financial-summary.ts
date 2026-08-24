export type CanonicalSummaryAllocation = {
  id: string
  kind: 'business' | 'personal' | 'excluded'
  amountCents: number
  taxCategoryKey?: string | null
  taxTreatments?: import('./tax-treatment-model').CanonicalTaxTreatment[]
}

export type CanonicalSummaryDecision = {
  id: string
  supersedesDecisionId: string | null
  bookkeepingNature:
    | 'expense'
    | 'business_income'
    | 'transfer'
    | 'credit_card_payment'
    | 'refund'
    | 'owner_contribution'
    | 'loan_proceeds'
    | 'loan_principal_payment'
    | 'other_non_income'
    | null
  treatment: 'unresolved' | 'business' | 'personal' | 'mixed_use' | 'excluded'
  allocations: CanonicalSummaryAllocation[]
}

export type CanonicalSummaryRecord = {
  id: string
  occurredOn: string | null
  amountCents: number | null
  currency: string
  financialSourceAssociationId: string | null
  financialTransactionId: string | null
  sourceKind?: 'financial_transaction' | 'receipt' | 'manual'
  merchant?: string | null
  description?: string | null
  hasEvidence?: boolean
  receiptLost?: boolean
  decisions: CanonicalSummaryDecision[]
}

export type CanonicalSummaryContributor = {
  metric: 'business_income' | 'business_expenses'
  recordId: string
  decisionId: string
  allocationId: string
  financialSourceAssociationId: string | null
  financialTransactionId: string | null
  occurredOn: string
  signedAmountCents: number
}

export type CanonicalFinancialSummary = {
  currency: string
  periodStart: string
  periodEnd: string
  businessIncomeCents: number
  businessExpensesCents: number
  businessProfitCents: number
  completeness: {
    isComplete: boolean
    unresolvedRecordCount: number
    unresolvedSignedAmountCents: number | null
    hasUnresolvedCustomerQuestions: boolean
    unresolvedCustomerQuestionCount: number
    unsupportedCurrencies: string[]
    undatedRecordCount: number
  }
  contributors: CanonicalSummaryContributor[]
}

export type CanonicalFinancialSummaryInput = {
  records: CanonicalSummaryRecord[]
  periodStart: string
  periodEnd: string
  currency: string
  unresolvedCustomerQuestionCount: number
  undatedRecordCount?: number
}

function assertDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO calendar date.`)
  }
}

function addCents(total: number, amount: number) {
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(total + amount)) {
    throw new Error('Canonical summary amounts must remain safe integer cents.')
  }
  return total + amount
}

function currentDecision(decisions: CanonicalSummaryDecision[]) {
  if (decisions.length === 0) return null
  const superseded = new Set(decisions.map((decision) => decision.supersedesDecisionId).filter(Boolean))
  const leaves = decisions.filter((decision) => !superseded.has(decision.id))
  if (leaves.length !== 1) throw new Error('Canonical decision history must have exactly one current leaf.')
  return leaves[0]
}

/**
 * Canonical signed convention: positive cents are inflows and negative cents are
 * outflows. Expense credits therefore reduce net expense without using abs().
 */
export function aggregateCanonicalFinancialSummary(
  input: CanonicalFinancialSummaryInput
): CanonicalFinancialSummary {
  assertDate(input.periodStart, 'Period start')
  assertDate(input.periodEnd, 'Period end')
  if (input.periodStart > input.periodEnd) throw new Error('Period start must not follow period end.')
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error('Currency must be a three-letter code.')

  let incomeSigned = 0
  let expenseSigned = 0
  let unresolvedRecordCount = 0
  let undatedRecordCount = input.undatedRecordCount ?? 0
  let unresolvedSignedTotal = 0
  let unresolvedAmountsKnown = true
  const unsupportedCurrencies = new Set<string>()
  const contributors: CanonicalSummaryContributor[] = []

  for (const record of input.records) {
    if (record.occurredOn == null) {
      undatedRecordCount += 1
      continue
    }
    if (record.occurredOn < input.periodStart || record.occurredOn > input.periodEnd) continue
    if (record.currency !== input.currency) {
      unsupportedCurrencies.add(record.currency)
      continue
    }

    const decision = currentDecision(record.decisions)
    if (!decision || decision.treatment === 'unresolved') {
      unresolvedRecordCount += 1
      if (record.amountCents == null) unresolvedAmountsKnown = false
      else unresolvedSignedTotal = addCents(unresolvedSignedTotal, record.amountCents)
      continue
    }

    if (decision.bookkeepingNature !== 'business_income' && decision.bookkeepingNature !== 'expense') {
      continue
    }

    for (const allocation of decision.allocations) {
      if (allocation.kind !== 'business') continue
      if (decision.bookkeepingNature === 'business_income') {
        incomeSigned = addCents(incomeSigned, allocation.amountCents)
      } else {
        expenseSigned = addCents(expenseSigned, allocation.amountCents)
      }
      contributors.push({
        metric: decision.bookkeepingNature === 'business_income'
          ? 'business_income'
          : 'business_expenses',
        recordId: record.id,
        decisionId: decision.id,
        allocationId: allocation.id,
        financialSourceAssociationId: record.financialSourceAssociationId,
        financialTransactionId: record.financialTransactionId,
        occurredOn: record.occurredOn,
        signedAmountCents: allocation.amountCents,
      })
    }
  }

  const businessExpensesCents = addCents(0, -expenseSigned)
  const businessProfitCents = addCents(incomeSigned, -businessExpensesCents)
  const unsupported = [...unsupportedCurrencies].sort()

  return {
    currency: input.currency,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    businessIncomeCents: incomeSigned,
    businessExpensesCents,
    businessProfitCents,
    completeness: {
      isComplete: unresolvedRecordCount === 0 && unsupported.length === 0 && undatedRecordCount === 0,
      unresolvedRecordCount,
      unresolvedSignedAmountCents: unresolvedAmountsKnown ? unresolvedSignedTotal : null,
      hasUnresolvedCustomerQuestions: input.unresolvedCustomerQuestionCount > 0,
      unresolvedCustomerQuestionCount: input.unresolvedCustomerQuestionCount,
      unsupportedCurrencies: unsupported,
      undatedRecordCount,
    },
    contributors,
  }
}
