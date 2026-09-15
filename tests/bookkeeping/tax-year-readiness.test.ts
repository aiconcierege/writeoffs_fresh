import { purchaseReviewItems } from '../../app/lib/bookkeeping/tax-time-review'
import { describe, expect, it } from 'vitest'
import { deriveTaxYearReadiness, documentationSummaryCsv, readinessIssuesCsv, scopeTaxYearReadiness,
  type TaxYearReadinessContext } from '../../app/lib/bookkeeping/tax-year-readiness'

function context(overrides: Partial<TaxYearReadinessContext> = {}): TaxYearReadinessContext {
  return {
    report: { currency: 'USD', periodStart: '2025-01-01', periodEnd: '2025-12-31', businessIncomeCents: 200000,
      businessExpensesCents: 50000, businessProfitCents: 150000, estimatedDeductionsCents: 50000,
      estimatedTaxableIncomeCents: null, categorizedBusinessExpensesCents: 50000, uncategorizedBusinessExpensesCents: 0,
      categoryTotals: [], completeness: { isComplete: true, unresolvedRecordCount: 0, unsupportedCurrencies: [], legacyFallbackCount: 0, unresolvedTaxTreatmentCount: 0 },
      rows: [{ sourceModel:'canonical',sourceLabel:'Financial account',recordId:'income',occurredOn:'2025-02-01',merchant:'Customer',description:null,currency:'USD',signedAmountCents:200000,businessAmountCents:200000,personalAmountCents:0,treatment:'Business',categoryKey:null,hasEvidence:false,receiptLost:false,specialTreatmentReason:null },
        { sourceModel:'canonical',sourceLabel:'Financial account',recordId:'expense',occurredOn:'2025-03-01',merchant:'Supplies',description:null,currency:'USD',signedAmountCents:-50000,businessAmountCents:50000,personalAmountCents:0,treatment:'Business',categoryKey:'supplies',hasEvidence:true,receiptLost:false,specialTreatmentReason:null }] },
    customerQuestions: [], contractorSummaries: [], businessMilesMilli: 0, undatedRecordCount: 0,
    processingCount: 0, failedProcessingCount: 0, receiptProcessingCount: 0, openDeductionAttentionCount: 0,
    incompleteHomeOfficeProfile: false, paidInvoiceWithoutIncomeCount: 0, disconnectedDataSourceCount: 0, ...overrides,
  }
}

describe('tax-year readiness', () => {
  it('marks a supported, resolved canonical year ready without duplicating totals', () => {
    const value = deriveTaxYearReadiness(2025, context())
    expect(value.status).toBe('ready')
    expect(value.totals).toMatchObject({ businessIncomeCents: 200000, businessExpensesCents: 50000, businessProfitCents: 150000 })
  })
  it('distinguishes unresolved customer activity from system processing', () => {
    const unresolved = context(); unresolved.report.rows[0] = { ...unresolved.report.rows[0], treatment:'Still being worked on' }
    expect(deriveTaxYearReadiness(2025, unresolved).status).toBe('needs_attention')
    const processing = deriveTaxYearReadiness(2025, context({ processingCount: 3 }))
    expect(processing.status).toBe('still_processing')
    expect(processing.issues[0]).toMatchObject({ code:'RECORDS_PROCESSING', kind:'processing', actionHref:null })
  })
  it('keeps a documented-missing business expense and reports documentation separately', () => {
    const value = context(); value.report.rows[1] = { ...value.report.rows[1], hasEvidence:false }
    const readiness = deriveTaxYearReadiness(2025, value)
    expect(readiness.totals.businessExpensesCents).toBe(50000)
    expect(readiness.status).toBe('ready')
    expect(readiness.dimensions.find(d => d.key === 'documentation')?.status).toBe('needs_attention')
  })
  it('keeps tax-time judgment separate from customer facts', () => {
    const value = deriveTaxYearReadiness(2025, context({ canonicalReviewItems: [{ kind:'potential_capital_asset',
      title:'Computer equipment purchase',detail:'Equipment may have special tax treatment.',occurredOn:'2025-04-02',amountCents:180000 }],
      vehicleReports:[{displayName:'Work van',method:'actual_expenses',businessMilesMilli:1000,totalMilesMilli:2000,
        allocationBasisPoints:5000,mileageDeductionCents:0,actualExpenseCents:50000,deductibleActualExpenseCents:null,
        requiresCpaReview:true,cpaReviewReasons:['LEASE_INCLUSION_AMOUNT']}]}))
    expect(value.status).toBe('ready')
    expect(value.reviewItems.map(item => item.kind)).toEqual(['potential_capital_asset','vehicle'])
    expect(value.issues.some(issue => issue.code === 'VEHICLE_CPA_REVIEW')).toBe(false)
  })
  it('supports 2026 and fails closed for 2027 while retaining unresolved tax facts', () => {
    const supported = deriveTaxYearReadiness(2026, context())
    expect(supported.supportedTaxYear).toBe(true)
    expect(supported.totals.estimatedDeductionsCents).toBe(50000)
    const unsupported = deriveTaxYearReadiness(2027, context())
    expect(unsupported.status).toBe('incomplete')
    expect(unsupported.totals.estimatedDeductionsCents).toBeNull()
    const unresolved = context({ openDeductionAttentionCount:1, incompleteHomeOfficeProfile:true })
    unresolved.report.completeness.unresolvedTaxTreatmentCount = 1
    expect(deriveTaxYearReadiness(2025, unresolved).status).toBe('needs_attention')
  })

  it('keeps expense-scoped 2026 readiness independent from income completeness', () => {
    const source = context()
    source.report.rows[0] = { ...source.report.rows[0], treatment: 'Still being worked on' }
    const value = scopeTaxYearReadiness(deriveTaxYearReadiness(2026, source), 'expenses')
    expect(value.supportedTaxYear).toBe(true)
    expect(value.status).toBe('ready')
    expect(value.dimensions.some(dimension => dimension.key === 'income')).toBe(false)
    expect(value.issues.some(issue => issue.code === 'INCOME_NATURE_UNRESOLVED'
      || issue.code === 'UNSUPPORTED_TAX_YEAR')).toBe(false)
  })
  it('separates mileage facts, contractor attention, and invoice integrity', () => {
    const contractor = { id:'c',currentEventId:'e',displayName:'Joe',businessName:null,active:true,totalPaidCents:90000,
      paymentCount:1,paymentMethods:['check'],w9Status:'on_file',w9EventId:'w',awareness:'potential_1099_attention' as const,taxYear:2025 }
    const value = deriveTaxYearReadiness(2025, context({ businessMilesMilli:12500, contractorSummaries:[contractor], paidInvoiceWithoutIncomeCount:1 }))
    expect(value.status).toBe('incomplete')
    expect(value.reviewItems.find(item => item.kind === 'contractor')?.detail).toMatch(/return preparer/i)
    expect(value.issues.some(issue => issue.code === 'MILEAGE_TAX_TREATMENT_UNRESOLVED')).toBe(true)
  })
  it('exports bounded factual package summaries', () => {
    const value = context({ openDeductionAttentionCount:1 }); value.report.rows[1] = { ...value.report.rows[1], hasEvidence:false }
    const readiness = deriveTaxYearReadiness(2025, value)
    expect(readinessIssuesCsv(readiness)).toContain('DEDUCTION_FACTS_INCOMPLETE')
    expect(documentationSummaryCsv(readiness)).toContain('2025,0,1,0,0')
    expect(readinessIssuesCsv(readiness)).not.toMatch(/audit proof|IRS compliant|must file/i)
  })
})


describe('current purchase review and readiness', () => {
  it('preserves a known asset without making its pending tax decision a fact blocker', () => {
    const value = context()
    value.report.rows[1] = { ...value.report.rows[1], specialTreatmentReason: 'POSSIBLE_ASSET', unresolvedTaxTreatmentCount: 1 }
    value.report.completeness.unresolvedTaxTreatmentCount = 1
    value.canonicalReviewItems = purchaseReviewItems(value.report)
    const ready = deriveTaxYearReadiness(2025, value)
    expect(ready.status).toBe('ready')
    expect(ready.reviewItems).toHaveLength(1)
    expect(ready.reviewItems[0]).toMatchObject({ businessAmountCents: 50000, amountCents: 50000 })
    expect(ready.reviewItems[0].detail).not.toMatch(/qualifies|eligible|election made/i)
    value.customerQuestions = [{ id: 'fact', source: 'bookkeeping', prompt: 'What was this for?', transaction: { date: '2025-03-01', amountCents: -50000 } }]
    expect(deriveTaxYearReadiness(2025, value).status).toBe('needs_attention')
    value.customerQuestions = []
    expect(deriveTaxYearReadiness(2025, value).status).toBe('ready')
  })
  it('reflects corrected nature, allocation, and description without historical flags', () => {
    const value = context()
    value.report.rows[1] = { ...value.report.rows[1], specialTreatmentReason: 'POSSIBLE_ASSET', description: 'Computer for client work', businessAmountCents: 30000 }
    expect(purchaseReviewItems(value.report)[0]).toMatchObject({ description: 'Computer for client work', businessAmountCents: 30000 })
    value.report.rows[1].specialTreatmentReason = null
    value.report.rows[1].description = 'Computer repair service'
    expect(purchaseReviewItems(value.report)).toEqual([])
    value.report.rows[1].specialTreatmentReason = 'POSSIBLE_ASSET'
    value.report.rows[1].treatment = 'Personal'
    expect(purchaseReviewItems(value.report)).toEqual([])
  })
  it('never flags an ordinary expense based on amount or merchant', () => {
    const value = context()
    value.report.rows[1].merchant = 'Equipment Company'
    value.report.rows[1].businessAmountCents = 10000000
    expect(purchaseReviewItems(value.report)).toEqual([])
  })
})
