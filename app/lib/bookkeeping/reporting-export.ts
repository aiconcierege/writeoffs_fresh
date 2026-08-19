import type { CanonicalReport } from './reporting-model'

function csv(value: string | number) {
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function canonicalReportCsv(report: CanonicalReport, unresolvedOnly = false) {
  const header = ['date', 'merchant', 'description', 'amount', 'business_amount', 'personal_amount',
    'treatment', 'category', 'receipt_status', 'source']
  const rows = unresolvedOnly ? report.rows.filter((row) => row.treatment === 'Still being worked on') : report.rows
  return [header.join(','), ...rows.map((row) => [
    row.occurredOn, row.merchant, row.description ?? '', (row.signedAmountCents / 100).toFixed(2),
    (row.businessAmountCents / 100).toFixed(2), (row.personalAmountCents / 100).toFixed(2),
    row.treatment, report.categoryTotals.find((category) => category.categoryKey === row.categoryKey)?.categoryLabel ?? row.categoryKey ?? '', row.hasEvidence ? 'Attached' : row.receiptLost ? 'Receipt reported lost' : 'Not attached',
    row.sourceLabel,
  ].map(csv).join(','))].join('\r\n')
}
