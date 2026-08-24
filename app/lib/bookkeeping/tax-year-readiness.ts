import type { CanonicalReport } from './reporting-model'
import type { ContractorSummary } from './contractor-awareness'

export const TAX_YEAR_READINESS_VERSION = 'tax-year-readiness:v1'
export const SUPPORTED_TAX_YEARS = [2025] as const

export type ReadinessStatus = 'ready' | 'needs_attention' | 'still_processing' | 'incomplete'
export type DimensionStatus = 'complete' | 'needs_attention' | 'still_processing' | 'incomplete' | 'not_applicable' | 'good'
export type ReadinessIssue = {
  code: string
  title: string
  detail: string
  kind: 'customer_action' | 'processing' | 'integrity' | 'documentation' | 'data_source'
  actionHref: string | null
  recordId?: string
}
export type ReadinessDimension = {
  key: 'income' | 'expenses' | 'documentation' | 'mileage' | 'contractors' | 'tax_treatment'
  label: string
  status: DimensionStatus
  summary: string
  issueCount: number
}

export type TaxYearReadinessContext = {
  report: CanonicalReport
  customerQuestions: Array<{ id: string; source?: string; prompt: string; transaction: { date: string | null; amountCents: number | null } }>
  contractorSummaries: ContractorSummary[]
  businessMilesMilli: number
  undatedRecordCount: number
  processingCount: number
  failedProcessingCount: number
  receiptProcessingCount: number
  openDeductionAttentionCount: number
  incompleteHomeOfficeProfile: boolean
  paidInvoiceWithoutIncomeCount: number
  disconnectedDataSourceCount: number
}

const plural = (count: number, singular: string, pluralValue = `${singular}s`) => `${count} ${count === 1 ? singular : pluralValue}`

export function deriveTaxYearReadiness(taxYear: number, input: TaxYearReadinessContext) {
  const supportedTaxYear = (SUPPORTED_TAX_YEARS as readonly number[]).includes(taxYear)
  const issues: ReadinessIssue[] = []
  const rows = input.report.rows
  const unresolvedIncome = rows.filter(row => row.treatment === 'Still being worked on' && row.signedAmountCents > 0)
  const unresolvedExpenses = rows.filter(row => row.treatment === 'Still being worked on' && row.signedAmountCents < 0)
  const missingDocumentation = rows.filter(row => row.businessAmountCents > 0 && row.signedAmountCents < 0
    && !row.hasEvidence && !row.receiptLost)
  const lostDocumentation = rows.filter(row => row.businessAmountCents > 0 && row.signedAmountCents < 0 && row.receiptLost)
  const specialTreatment = rows.filter(row => Boolean(row.specialTreatmentReason))
  const yearQuestions = input.customerQuestions.filter(question => !question.transaction.date
    || question.transaction.date.startsWith(`${taxYear}-`))
  const contractorAttention = input.contractorSummaries.filter(row => row.totalPaidCents > 0
    && ['information_incomplete', 'w9_needed', 'potential_1099_attention'].includes(row.awareness))

  for (const row of unresolvedIncome) issues.push({ code: 'INCOME_NATURE_UNRESOLVED', title: `Income needs context: ${row.merchant}`,
    detail: 'WriteOffs still needs a business fact before this inflow can be included safely.', kind: 'customer_action',
    actionHref: '/questions', recordId: row.recordId })
  for (const row of unresolvedExpenses) issues.push({ code: 'EXPENSE_NATURE_UNRESOLVED', title: `Spending needs context: ${row.merchant}`,
    detail: 'WriteOffs still needs a business fact before this outflow can be treated safely.', kind: 'customer_action',
    actionHref: '/questions', recordId: row.recordId })
  if (yearQuestions.some(question => question.source === 'bookkeeping') && unresolvedIncome.length + unresolvedExpenses.length === 0) {
    issues.push({ code: 'BOOKKEEPING_QUESTIONS_OPEN', title: 'Business details need answers',
      detail: `${plural(yearQuestions.filter(question => question.source === 'bookkeeping').length, 'question')} remain in your existing attention queue.`,
      kind: 'customer_action', actionHref: '/questions' })
  }
  if (missingDocumentation.length || lostDocumentation.length) issues.push({ code: 'DOCUMENTATION_INCOMPLETE',
    title: 'Some expense documentation is unavailable',
    detail: `${plural(missingDocumentation.length, 'expense')} have no attached document; ${lostDocumentation.length} were reported unavailable. Established business treatment remains unchanged.`,
    kind: 'documentation', actionHref: '/transactions' })
  if (input.undatedRecordCount > 0) issues.push({ code: 'UNDATED_RECORDS', title: 'Some activity is missing a date',
    detail: `${plural(input.undatedRecordCount, 'record')} cannot be assigned to a tax year yet.`, kind: 'integrity', actionHref: '/transactions' })
  if (input.openDeductionAttentionCount > 0) issues.push({ code: 'DEDUCTION_FACTS_INCOMPLETE', title: 'Deduction details need information',
    detail: `${plural(input.openDeductionAttentionCount, 'factual answer')} remain open.`, kind: 'customer_action', actionHref: '/questions' })
  if (input.incompleteHomeOfficeProfile) issues.push({ code: 'HOME_OFFICE_PROFILE_INCOMPLETE', title: 'Home-office details are incomplete',
    detail: 'WriteOffs needs the remaining factual details before it can evaluate this safely.', kind: 'customer_action', actionHref: '/deductions' })
  for (const row of specialTreatment) issues.push({ code: 'SPECIAL_TAX_TREATMENT_UNRESOLVED', title: `${row.merchant} needs tax details`,
    detail: 'No unsupported deduction has been included for this item.', kind: 'customer_action', actionHref: '/questions', recordId: row.recordId })
  if (input.report.completeness.unresolvedTaxTreatmentCount > 0) issues.push({ code: 'TAX_TREATMENTS_UNRESOLVED', title: 'Some tax treatment is unresolved',
    detail: `${plural(input.report.completeness.unresolvedTaxTreatmentCount, 'business expense')} remain excluded from estimated deductions.`,
    kind: 'customer_action', actionHref: '/questions' })
  for (const row of contractorAttention) issues.push({ code: `CONTRACTOR_${row.awareness.toUpperCase()}`,
    title: `${row.displayName} needs contractor-record attention`,
    detail: row.awareness === 'potential_1099_attention' ? 'Potential information-reporting attention; this is not a filing determination.'
      : row.awareness === 'w9_needed' ? 'W-9 information is not currently on file.' : 'Payment or contractor information is incomplete.',
    kind: 'customer_action', actionHref: '/contractors' })
  if (input.businessMilesMilli > 0) issues.push({ code: 'MILEAGE_TAX_TREATMENT_UNRESOLVED', title: 'Mileage tax treatment needs attention',
    detail: 'Mileage facts are preserved, but WriteOffs has not guessed a vehicle deduction method.', kind: 'customer_action', actionHref: '/mileage' })
  if (input.paidInvoiceWithoutIncomeCount > 0) issues.push({ code: 'PAID_INVOICE_LINK_MISSING', title: 'A paid invoice is missing valid income support',
    detail: `${plural(input.paidInvoiceWithoutIncomeCount, 'invoice')} need an established income link.`, kind: 'integrity', actionHref: '/invoices' })
  if (input.processingCount + input.receiptProcessingCount > 0) issues.push({ code: 'RECORDS_PROCESSING', title: 'WriteOffs is still working',
    detail: `${plural(input.processingCount + input.receiptProcessingCount, 'item')} are still processing.`, kind: 'processing', actionHref: null })
  if (input.failedProcessingCount > 0) issues.push({ code: 'PROCESSING_RETRY_NEEDED', title: 'Some processing needs to be retried',
    detail: `${plural(input.failedProcessingCount, 'item')} could not finish. No customer accounting judgment is requested.`, kind: 'integrity', actionHref: null })
  if (input.disconnectedDataSourceCount > 0) issues.push({ code: 'DATA_SOURCE_NEEDS_ATTENTION', title: 'A connected account needs attention',
    detail: `${plural(input.disconnectedDataSourceCount, 'connection')} need to be restored or checked.`, kind: 'data_source', actionHref: '/settings/banking' })
  if (!supportedTaxYear) issues.push({ code: 'UNSUPPORTED_TAX_YEAR', title: `${taxYear} tax rules are not yet supported`,
    detail: 'WriteOffs will not apply a different year’s tax rules.', kind: 'integrity', actionHref: null })

  const dimensions: ReadinessDimension[] = [
    { key: 'income', label: 'Income', status: unresolvedIncome.length ? 'needs_attention' : 'complete',
      summary: unresolvedIncome.length ? `${plural(unresolvedIncome.length, 'inflow')} need context.` : 'Current established income is included once.', issueCount: unresolvedIncome.length },
    { key: 'expenses', label: 'Expenses', status: unresolvedExpenses.length ? 'needs_attention' : 'complete',
      summary: unresolvedExpenses.length ? `${plural(unresolvedExpenses.length, 'outflow')} need context.` : 'Current established business expenses are included once.', issueCount: unresolvedExpenses.length },
    { key: 'documentation', label: 'Documentation', status: input.receiptProcessingCount ? 'still_processing'
      : missingDocumentation.length || lostDocumentation.length ? 'needs_attention' : 'good',
      summary: input.receiptProcessingCount ? `${plural(input.receiptProcessingCount, 'document')} still processing.`
        : missingDocumentation.length || lostDocumentation.length
          ? `${plural(missingDocumentation.length, 'expense')} have no attached document; ${lostDocumentation.length} reported unavailable.`
          : 'Available documentation is organized.', issueCount: missingDocumentation.length + lostDocumentation.length + input.receiptProcessingCount },
    { key: 'mileage', label: 'Mileage', status: input.businessMilesMilli ? 'needs_attention' : 'not_applicable',
      summary: input.businessMilesMilli ? `${(input.businessMilesMilli / 1000).toLocaleString('en-US')} business miles recorded; tax treatment remains separate.` : 'No business mileage is recorded for this year.', issueCount: input.businessMilesMilli ? 1 : 0 },
    { key: 'contractors', label: 'Contractor records', status: contractorAttention.length ? 'needs_attention'
      : input.contractorSummaries.some(row => row.totalPaidCents > 0) ? 'complete' : 'not_applicable',
      summary: contractorAttention.length ? `${plural(contractorAttention.length, 'contractor')} need information.`
        : input.contractorSummaries.some(row => row.totalPaidCents > 0) ? 'Tracked contractor information is current.' : 'No contractor payments are tracked.', issueCount: contractorAttention.length },
    { key: 'tax_treatment', label: 'Tax treatment', status: !supportedTaxYear ? 'incomplete'
      : input.report.completeness.unresolvedTaxTreatmentCount || specialTreatment.length || input.incompleteHomeOfficeProfile ? 'needs_attention' : 'complete',
      summary: !supportedTaxYear ? `Approved tax rules are unavailable for ${taxYear}.`
        : input.report.completeness.unresolvedTaxTreatmentCount || specialTreatment.length || input.incompleteHomeOfficeProfile
          ? 'Unsupported deduction amounts remain excluded.' : 'Supported current tax treatment is complete.',
      issueCount: input.report.completeness.unresolvedTaxTreatmentCount + specialTreatment.length + (input.incompleteHomeOfficeProfile ? 1 : 0) },
  ]
  const status: ReadinessStatus = issues.some(issue => issue.kind === 'integrity') ? 'incomplete'
    : issues.some(issue => issue.kind === 'customer_action' || issue.kind === 'data_source' || issue.kind === 'documentation') ? 'needs_attention'
      : issues.some(issue => issue.kind === 'processing') ? 'still_processing' : 'ready'
  return { version: TAX_YEAR_READINESS_VERSION, taxYear, supportedTaxYear, status, dimensions, issues,
    totals: { businessIncomeCents: input.report.businessIncomeCents, businessExpensesCents: input.report.businessExpensesCents,
      businessProfitCents: input.report.businessProfitCents, estimatedDeductionsCents: supportedTaxYear ? input.report.estimatedDeductionsCents : null,
      businessMilesMilli: input.businessMilesMilli },
    documentation: { presentCount: rows.filter(row => row.businessAmountCents > 0 && row.signedAmountCents < 0 && row.hasEvidence).length, missingCount: missingDocumentation.length,
      unavailableCount: lostDocumentation.length, processingCount: input.receiptProcessingCount },
    caveat: 'Ready for tax preparation means records are complete based on the information currently in WriteOffs. It is not a guarantee that a tax return is complete or correct.',
    dataSourceLimitation: 'WriteOffs can identify known connection problems, but cannot verify that every relevant account or cash source has been provided.',
  }
}

export function readinessIssuesCsv(readiness: ReturnType<typeof deriveTaxYearReadiness>) {
  const csv = (value: string | number) => { const text = String(value); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text }
  return [['tax_year','readiness_status','issue_code','issue_type','title','detail','action'],
    ...readiness.issues.map(issue => [readiness.taxYear,readiness.status,issue.code,issue.kind,issue.title,issue.detail,issue.actionHref ?? ''])]
    .map(row => row.map(csv).join(',')).join('\r\n')
}

export function documentationSummaryCsv(readiness: ReturnType<typeof deriveTaxYearReadiness>) {
  return `tax_year,documentation_present,documentation_missing,documentation_unavailable,documentation_processing\r\n${readiness.taxYear},${readiness.documentation.presentCount},${readiness.documentation.missingCount},${readiness.documentation.unavailableCount},${readiness.documentation.processingCount}`
}
