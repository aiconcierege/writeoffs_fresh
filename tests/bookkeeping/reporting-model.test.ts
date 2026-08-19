import { describe, expect, it } from 'vitest'
import { buildCanonicalReport, calendarPeriod } from '../../app/lib/bookkeeping/reporting-model'
import { canonicalReportCsv } from '../../app/lib/bookkeeping/reporting-export'
import type { CanonicalSummaryRecord } from '../../app/lib/bookkeeping/financial-summary'

let id = 0
function record(input: Partial<CanonicalSummaryRecord> & { amountCents?: number } = {}): CanonicalSummaryRecord {
  id += 1
  const amount = input.amountCents ?? -10_000
  return { id: `record-${id}`, occurredOn: '2026-08-19', amountCents: amount, currency: 'USD',
    financialSourceAssociationId: `source-${id}`, financialTransactionId: `transaction-${id}`,
    sourceKind: 'financial_transaction', merchant: 'Vendor', description: 'Purchase', hasEvidence: false,
    decisions: [{ id: `decision-${id}`, supersedesDecisionId: null, bookkeepingNature: 'expense',
      treatment: 'business', allocations: [{ id: `allocation-${id}`, kind: 'business', amountCents: amount,
      taxCategoryKey: 'supplies' }] }], ...input }
}
function report(records: CanonicalSummaryRecord[]) {
  return buildCanonicalReport({ canonicalRecords: records, legacyRecords: [],
    periodStart: '2026-01-01', periodEnd: '2026-12-31', currency: 'USD' })
}

describe('canonical reporting read model', () => {
  it('aggregates signed income, expense credits, and bookkeeping profit exactly', () => {
    const result = report([record({ amountCents: 100_001, decisions: [{ id: 'income', supersedesDecisionId: null,
      bookkeepingNature: 'business_income', treatment: 'business', allocations: [{ id: 'ia', kind: 'business', amountCents: 100_001 }] }] }),
    record({ amountCents: -20_009 }), record({ amountCents: 2_000 })])
    expect(result).toMatchObject({ businessIncomeCents: 100_001, businessExpensesCents: 18_009,
      businessProfitCents: 81_992 })
  })

  it('uses exact mixed allocations and excludes personal treatment', () => {
    const mixed = record({ decisions: [{ id: 'mixed', supersedesDecisionId: null, bookkeepingNature: 'expense', treatment: 'mixed_use', allocations: [
      { id: 'business', kind: 'business', amountCents: -7_000, taxCategoryKey: 'supplies' },
      { id: 'personal', kind: 'personal', amountCents: -3_000 },
    ] }] })
    const personal = record({ decisions: [{ id: 'personal-only', supersedesDecisionId: null, bookkeepingNature: 'expense', treatment: 'personal', allocations: [
      { id: 'p', kind: 'personal', amountCents: -10_000 },
    ] }] })
    const result = report([mixed, personal])
    expect(result.businessExpensesCents).toBe(7_000)
    expect(result.rows[0].businessAmountCents).toBe(7_000)
    expect(result.rows[0].personalAmountCents).toBe(3_000)
  })

  it('uses only the corrected current leaf', () => {
    const prior = { id: 'prior', supersedesDecisionId: null, bookkeepingNature: 'expense' as const,
      treatment: 'business' as const, allocations: [{ id: 'old', kind: 'business' as const, amountCents: -10_000 }] }
    const corrected = { id: 'corrected', supersedesDecisionId: 'prior', bookkeepingNature: 'expense' as const,
      treatment: 'mixed_use' as const, allocations: [{ id: 'new', kind: 'business' as const, amountCents: -6_000 },
        { id: 'new-personal', kind: 'personal' as const, amountCents: -4_000 }] }
    expect(report([record({ decisions: [prior, corrected] })]).businessExpensesCents).toBe(6_000)
  })

  it('includes receipt-only expenses without fabricating a financial source', () => {
    const result = report([record({ sourceKind: 'receipt', financialSourceAssociationId: null,
      financialTransactionId: null, hasEvidence: true })])
    expect(result.businessExpensesCents).toBe(10_000)
    expect(result.rows[0]).toMatchObject({ sourceLabel: 'Receipt only', hasEvidence: true })
  })

  it('keeps Receipt Lost separate from financial arithmetic', () => {
    const ordinary = report([record()])
    const lost = report([record({ receiptLost: true })])
    expect(lost.businessExpensesCents).toBe(ordinary.businessExpensesCents)
    expect(lost.rows[0].receiptLost).toBe(true)
  })

  it('excludes unresolved canonical activity and reports incompleteness', () => {
    const result = report([record({ decisions: [{ id: 'u', supersedesDecisionId: null,
      bookkeepingNature: null, treatment: 'unresolved', allocations: [] }] })])
    expect(result.businessExpensesCents).toBe(0)
    expect(result.completeness).toMatchObject({ isComplete: false, unresolvedRecordCount: 1 })
    expect(result.estimatedDeductionsCents).toBeNull()
  })

  it('uses legacy-only categorized fallback but does not invent unresolved classification', () => {
    const result = buildCanonicalReport({ canonicalRecords: [], periodStart: '2026-01-01', periodEnd: '2026-12-31', currency: 'USD', legacyRecords: [
      { id: 'legacy-a', occurredOn: '2026-02-01', amountCents: 2_500, currency: 'USD', merchant: 'Old', description: null, categoryKey: 'legacy-supplies', hasEvidence: false, receiptLost: false },
      { id: 'legacy-b', occurredOn: '2026-02-02', amountCents: 9_000, currency: 'USD', merchant: 'Unknown', description: null, categoryKey: null, hasEvidence: false, receiptLost: false },
    ] })
    expect(result.businessExpensesCents).toBe(2_500)
    expect(result.estimatedDeductionsCents).toBeNull()
    expect(result.completeness).toMatchObject({ legacyFallbackCount: 2, unresolvedRecordCount: 1 })
  })

  it('supports date-only month, quarter, YTD, annual, leap, and year boundaries', () => {
    expect(calendarPeriod({ kind: 'month', year: 2024, month: 2 })).toEqual({ periodStart: '2024-02-01', periodEnd: '2024-02-29' })
    expect(calendarPeriod({ kind: 'quarter', year: 2026, quarter: 4 })).toEqual({ periodStart: '2026-10-01', periodEnd: '2026-12-31' })
    expect(calendarPeriod({ kind: 'ytd', year: 2026, asOf: '2026-08-19' })).toEqual({ periodStart: '2026-01-01', periodEnd: '2026-08-19' })
    expect(calendarPeriod({ kind: 'year', year: 2026 })).toEqual({ periodStart: '2026-01-01', periodEnd: '2026-12-31' })
  })

  it('exports current customer facts, mixed amounts, receipt provenance, and no internal IDs', () => {
    const result = report([record({ sourceKind: 'receipt', financialTransactionId: null,
      financialSourceAssociationId: null, merchant: 'A, Vendor', hasEvidence: true })])
    const csv = canonicalReportCsv(result)
    expect(csv).toContain('business_amount,personal_amount,treatment,category,receipt_status,source')
    expect(csv).toContain('Receipt only')
    expect(csv).not.toContain('record-')
    expect(csv).not.toContain('decision-')
  })

  it('includes only trusted current tax treatments in estimated deductions', () => {
    const supported = record({ decisions: [{ id: 'tax-decision', supersedesDecisionId: null,
      bookkeepingNature: 'expense', treatment: 'business', allocations: [{ id: 'tax-allocation',
        kind: 'business', amountCents: -10_000, taxCategoryKey: 'supplies', taxTreatments: [{
          id: 'tax-treatment', allocationId: 'tax-allocation', supersedesTaxTreatmentId: null,
          status: 'deductible', deductibleAmountCents: -8_000, taxCategoryKey: 'supplies',
          ruleKey: 'approved:test-rule', ruleVersion: 1, reason: 'Supported test conclusion.',
          provenance: 'system', confidence: null,
        }] }] }] })
    expect(report([supported]).estimatedDeductionsCents).toBe(8_000)
    expect(report([record()]).estimatedDeductionsCents).toBeNull()
  })

  it('keeps bookkeeping P&L independent from fictional tax limitations', () => {
    const limited = record({ decisions: [{ id: 'limited-decision', supersedesDecisionId: null,
      bookkeepingNature: 'expense', treatment: 'business', allocations: [{ id: 'limited-business',
        kind: 'business', amountCents: -10_000, taxCategoryKey: 'fixture-half', taxTreatments: [{
          id: 'limited-tax', allocationId: 'limited-business', supersedesTaxTreatmentId: null,
          status: 'deductible', deductibleAmountCents: -5_000, taxCategoryKey: 'fixture-half',
          ruleKey: 'shared.fixture-half', ruleVersion: 1, reason: 'Fictional test limitation.',
          provenance: 'system', confidence: null,
        }] }] }] })
    const result = report([limited])
    expect(result.businessExpensesCents).toBe(10_000)
    expect(result.businessProfitCents).toBe(-10_000)
    expect(result.estimatedDeductionsCents).toBe(5_000)
  })

  it('applies tax preparation only after exact mixed-use bookkeeping allocation', () => {
    const mixed = record({ decisions: [{ id: 'mixed-tax-decision', supersedesDecisionId: null,
      bookkeepingNature: 'expense', treatment: 'mixed_use', allocations: [
        { id: 'mixed-tax-business', kind: 'business', amountCents: -7_000, taxCategoryKey: 'fixture-half',
          taxTreatments: [{ id: 'mixed-tax', allocationId: 'mixed-tax-business', supersedesTaxTreatmentId: null,
            status: 'deductible', deductibleAmountCents: -3_500, taxCategoryKey: 'fixture-half',
            ruleKey: 'shared.fixture-half', ruleVersion: 1, reason: 'Fictional test limitation.',
            provenance: 'system', confidence: null }] },
        { id: 'mixed-tax-personal', kind: 'personal', amountCents: -3_000 },
      ] }] })
    const result = report([mixed])
    expect(result.businessExpensesCents).toBe(7_000)
    expect(result.rows[0]).toMatchObject({ businessAmountCents: 7_000, personalAmountCents: 3_000 })
    expect(result.estimatedDeductionsCents).toBe(3_500)
  })

  it('does not fabricate estimated taxable income or tax liability', () => {
    const result = report([record()])
    expect(result.estimatedTaxableIncomeCents).toBeNull()
    expect(result).not.toHaveProperty('taxLiabilityCents')
  })
})
