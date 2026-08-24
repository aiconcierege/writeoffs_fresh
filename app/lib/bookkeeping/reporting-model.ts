import type { CanonicalSummaryRecord } from './financial-summary'
import { currentTaxTreatment } from './tax-treatment-model'

export type LegacyReportingRecord = {
  id: string
  occurredOn: string
  amountCents: number
  currency: string
  merchant: string
  description: string | null
  categoryKey: string | null
  hasEvidence: boolean
  receiptLost: boolean
}

export type ReportingRow = {
  sourceModel: 'canonical' | 'legacy'
  sourceLabel: 'Financial account' | 'Receipt only' | 'Recorded by customer' | 'Historical record'
  recordId: string
  occurredOn: string
  merchant: string
  description: string | null
  currency: string
  signedAmountCents: number
  businessAmountCents: number
  personalAmountCents: number
  treatment: 'Business' | 'Personal' | 'Business and personal' | 'Not counted' | 'Still being worked on' | 'Historical business expense'
  categoryKey: string | null
  hasEvidence: boolean
  receiptLost: boolean
  specialTreatmentReason: string | null
}

export type CanonicalReport = {
  currency: string
  periodStart: string
  periodEnd: string
  businessIncomeCents: number
  businessExpensesCents: number
  businessProfitCents: number
  estimatedDeductionsCents: number | null
  estimatedTaxableIncomeCents: null
  categorizedBusinessExpensesCents: number
  uncategorizedBusinessExpensesCents: number
  categoryTotals: Array<{ categoryKey: string; categoryLabel: string; amountCents: number; transactionCount: number }>
  completeness: {
    isComplete: boolean
    unresolvedRecordCount: number
    unsupportedCurrencies: string[]
    legacyFallbackCount: number
    unresolvedTaxTreatmentCount: number
  }
  rows: ReportingRow[]
}

function currentDecision(record: CanonicalSummaryRecord) {
  const superseded = new Set(record.decisions.map((item) => item.supersedesDecisionId).filter(Boolean))
  const leaves = record.decisions.filter((item) => !superseded.has(item.id))
  if (leaves.length > 1) throw new Error('Canonical decision history must have exactly one current leaf.')
  return leaves[0] ?? null
}

function safeAdd(total: number, amount: number) {
  const result = total + amount
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(amount) || !Number.isSafeInteger(result)) {
    throw new Error('Reporting amounts must remain safe integer cents.')
  }
  return result
}

function treatmentLabel(treatment: string | null): ReportingRow['treatment'] {
  if (treatment === 'business') return 'Business'
  if (treatment === 'personal') return 'Personal'
  if (treatment === 'mixed_use') return 'Business and personal'
  if (treatment === 'excluded') return 'Not counted'
  return 'Still being worked on'
}

/** Pure canonical-first aggregation. Positive is inflow; negative is outflow. */
export function buildCanonicalReport(input: {
  canonicalRecords: CanonicalSummaryRecord[]
  legacyRecords: LegacyReportingRecord[]
  categoryLabels?: Record<string, string>
  periodStart: string
  periodEnd: string
  currency: string
}): CanonicalReport {
  let income = 0
  let expenseSigned = 0
  let unresolvedRecordCount = 0
  let categorized = 0
  let deductibleSigned = 0
  let unresolvedTaxTreatmentCount = 0
  const unsupportedCurrencies = new Set<string>()
  const categoryMap = new Map<string, { signed: number; count: number }>()
  const rows: ReportingRow[] = []

  for (const record of input.canonicalRecords) {
    if (!record.occurredOn) { unresolvedRecordCount += 1; continue }
    if (record.occurredOn < input.periodStart || record.occurredOn > input.periodEnd) continue
    if (record.currency !== input.currency) { unsupportedCurrencies.add(record.currency); continue }
    const decision = currentDecision(record)
    const business = decision?.allocations.filter((item) => item.kind === 'business') ?? []
    const personal = decision?.allocations.filter((item) => item.kind === 'personal') ?? []
    const businessSigned = business.reduce((sum, item) => safeAdd(sum, item.amountCents), 0)
    const personalSigned = personal.reduce((sum, item) => safeAdd(sum, item.amountCents), 0)
    if (!decision || decision.treatment === 'unresolved') unresolvedRecordCount += 1
    if (decision?.bookkeepingNature === 'business_income') income = safeAdd(income, businessSigned)
    if (decision?.bookkeepingNature === 'expense') {
      expenseSigned = safeAdd(expenseSigned, businessSigned)
      for (const allocation of business) {
        const taxTreatment = currentTaxTreatment(allocation.taxTreatments ?? [])
        if (!taxTreatment || !['deductible', 'not_deductible'].includes(taxTreatment.status)) {
          unresolvedTaxTreatmentCount += 1
        } else if (taxTreatment.status === 'deductible') {
          deductibleSigned = safeAdd(deductibleSigned, taxTreatment.deductibleAmountCents!)
        }
        if (!allocation.taxCategoryKey) continue
        categorized = safeAdd(categorized, -allocation.amountCents)
        const slot = categoryMap.get(allocation.taxCategoryKey) ?? { signed: 0, count: 0 }
        slot.signed = safeAdd(slot.signed, allocation.amountCents)
        slot.count += 1
        categoryMap.set(allocation.taxCategoryKey, slot)
      }
    }
    rows.push({
      sourceModel: 'canonical', sourceLabel: record.sourceKind === 'receipt' ? 'Receipt only'
        : record.sourceKind === 'manual' ? 'Recorded by customer' : 'Financial account',
      recordId: record.id, occurredOn: record.occurredOn,
      merchant: record.merchant?.trim() || (record.sourceKind === 'receipt' ? 'Receipt purchase'
        : record.sourceKind === 'manual' ? 'Recorded activity' : 'Transaction'),
      description: record.description ?? null, currency: record.currency,
      signedAmountCents: record.amountCents ?? 0,
      businessAmountCents: decision?.bookkeepingNature === 'expense' ? -businessSigned : businessSigned,
      personalAmountCents: -personalSigned,
      treatment: treatmentLabel(decision?.treatment ?? null),
      categoryKey: business.length === 1 ? business[0].taxCategoryKey ?? null : null,
      hasEvidence: record.hasEvidence ?? record.sourceKind === 'receipt', receiptLost: record.receiptLost ?? false,
      specialTreatmentReason: record.specialTreatmentReason ?? null,
    })
  }

  for (const record of input.legacyRecords) {
    if (record.occurredOn < input.periodStart || record.occurredOn > input.periodEnd) continue
    if (record.currency !== input.currency) { unsupportedCurrencies.add(record.currency); continue }
    // Legacy storage did not distinguish income/nature. Preserve its historical
    // expense behavior only when a legacy category exists; never promote it to canonical truth.
    const businessExpense = record.categoryKey ? Math.abs(record.amountCents) : 0
    // Legacy categories are compatibility facts, never trusted canonical tax treatment.
    if (record.categoryKey) unresolvedTaxTreatmentCount += 1
    if (!record.categoryKey) unresolvedRecordCount += 1
    expenseSigned = safeAdd(expenseSigned, -businessExpense)
    if (record.categoryKey) {
      categorized = safeAdd(categorized, businessExpense)
      const slot = categoryMap.get(record.categoryKey) ?? { signed: 0, count: 0 }
      slot.signed = safeAdd(slot.signed, -businessExpense)
      slot.count += 1
      categoryMap.set(record.categoryKey, slot)
    }
    rows.push({
      sourceModel: 'legacy', sourceLabel: 'Historical record', recordId: record.id,
      occurredOn: record.occurredOn, merchant: record.merchant, description: record.description,
      currency: record.currency, signedAmountCents: -businessExpense,
      businessAmountCents: businessExpense, personalAmountCents: 0,
      treatment: record.categoryKey ? 'Historical business expense' : 'Still being worked on',
      categoryKey: record.categoryKey, hasEvidence: record.hasEvidence, receiptLost: record.receiptLost,
      specialTreatmentReason: null,
    })
  }

  const businessExpensesCents = safeAdd(0, -expenseSigned)
  const estimatedDeductionsCents = unresolvedTaxTreatmentCount === 0
    && unresolvedRecordCount === 0 && unsupportedCurrencies.size === 0
    ? safeAdd(0, -deductibleSigned) : null
  const categoryTotals = [...categoryMap].map(([categoryKey, value]) => ({
    categoryKey, categoryLabel: input.categoryLabels?.[categoryKey] ?? categoryKey,
    amountCents: -value.signed, transactionCount: value.count,
  })).sort((a, b) => b.amountCents - a.amountCents || a.categoryKey.localeCompare(b.categoryKey))
  rows.sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || a.recordId.localeCompare(b.recordId))
  return {
    currency: input.currency, periodStart: input.periodStart, periodEnd: input.periodEnd,
    businessIncomeCents: income, businessExpensesCents,
    businessProfitCents: safeAdd(income, -businessExpensesCents),
    estimatedDeductionsCents,
    // No approved business-level "taxable income" definition exists yet. In
    // particular, legacy income and personal tax assumptions are unavailable.
    estimatedTaxableIncomeCents: null,
    categorizedBusinessExpensesCents: categorized,
    uncategorizedBusinessExpensesCents: safeAdd(businessExpensesCents, -categorized),
    categoryTotals,
    completeness: { isComplete: unresolvedRecordCount === 0 && unsupportedCurrencies.size === 0,
      unresolvedRecordCount, unsupportedCurrencies: [...unsupportedCurrencies].sort(),
      legacyFallbackCount: input.legacyRecords.length, unresolvedTaxTreatmentCount },
    rows,
  }
}

export function calendarPeriod(input: { kind: 'month' | 'quarter' | 'ytd' | 'year'; year: number; month?: number; quarter?: number; asOf?: string }) {
  const pad = (value: number) => String(value).padStart(2, '0')
  if (input.kind === 'month') {
    const month = input.month ?? 1
    const last = new Date(Date.UTC(input.year, month, 0)).getUTCDate()
    return { periodStart: `${input.year}-${pad(month)}-01`, periodEnd: `${input.year}-${pad(month)}-${pad(last)}` }
  }
  if (input.kind === 'quarter') {
    const startMonth = ((input.quarter ?? 1) - 1) * 3 + 1
    const endMonth = startMonth + 2
    const last = new Date(Date.UTC(input.year, endMonth, 0)).getUTCDate()
    return { periodStart: `${input.year}-${pad(startMonth)}-01`, periodEnd: `${input.year}-${pad(endMonth)}-${pad(last)}` }
  }
  return { periodStart: `${input.year}-01-01`, periodEnd: input.kind === 'ytd' && input.asOf ? input.asOf : `${input.year}-12-31` }
}
