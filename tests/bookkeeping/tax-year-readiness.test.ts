import { describe, expect, it } from 'vitest'
import { deriveTaxYearReadiness, documentationSummaryCsv, readinessIssuesCsv, type TaxYearReadinessContext } from '../../app/lib/bookkeeping/tax-year-readiness'

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
    expect(readiness.status).toBe('needs_attention')
    expect(readiness.dimensions.find(d => d.key === 'documentation')?.status).toBe('needs_attention')
  })
  it('fails closed for unsupported years and unresolved tax or deduction facts', () => {
    const unsupported = deriveTaxYearReadiness(2026, context())
    expect(unsupported.status).toBe('incomplete')
    expect(unsupported.totals.estimatedDeductionsCents).toBeNull()
    const unresolved = context({ openDeductionAttentionCount:1, incompleteHomeOfficeProfile:true })
    unresolved.report.completeness.unresolvedTaxTreatmentCount = 1
    expect(deriveTaxYearReadiness(2025, unresolved).status).toBe('needs_attention')
  })
  it('separates mileage facts, contractor attention, and invoice integrity', () => {
    const contractor = { id:'c',currentEventId:'e',displayName:'Joe',businessName:null,active:true,totalPaidCents:90000,
      paymentCount:1,paymentMethods:['check'],w9Status:'on_file',w9EventId:'w',awareness:'potential_1099_attention' as const,taxYear:2025 }
    const value = deriveTaxYearReadiness(2025, context({ businessMilesMilli:12500, contractorSummaries:[contractor], paidInvoiceWithoutIncomeCount:1 }))
    expect(value.status).toBe('incomplete')
    expect(value.issues.find(issue => issue.code === 'CONTRACTOR_POTENTIAL_1099_ATTENTION')?.detail).toMatch(/not a filing determination/i)
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
