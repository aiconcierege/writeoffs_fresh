'use client'

import { useEffect, useState } from 'react'

type SummaryData = {
  businessIncomeCents: number
  businessExpensesCents: number
  businessProfitCents: number
  estimatedDeductionsCents: number | null
  businessMilesMilli: number
  mileageDeductionCents: null
  mileageTaxTreatmentStatus: 'facts_only' | 'not_applicable'
  categoryTotals: { categoryKey: string; categoryLabel: string; amountCents: number; transactionCount: number }[]
  completeness: { isComplete: boolean; unresolvedRecordCount: number; unresolvedTaxTreatmentCount: number }
  contractorSummaries: { id:string;displayName:string;totalPaidCents:number;paymentMethods:string[];w9Status:string;awareness:string }[]
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function ReportsSummary() {
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch('/api/reports/summary', { cache: 'no-store' })
    .then((response) => response.ok ? response.json() : null).then(setData)
    .catch(() => setData(null)).finally(() => setLoading(false)) }, [])
  if (loading) return <div className="flex h-[50vh] items-center justify-center text-sm text-muted">Loading report…</div>
  if (!data) return <div className="card p-6 text-sm text-muted">Your report is temporarily unavailable.</div>
  const metrics = [
    ['Business income', data.businessIncomeCents], ['Business expenses', data.businessExpensesCents],
    ['Estimated business profit', data.businessProfitCents],
    ...(data.estimatedDeductionsCents == null ? [] : [['Estimated deductions', data.estimatedDeductionsCents] as const]),
  ] as const
  return <main className="mx-auto max-w-4xl space-y-9 px-2 py-8 sm:px-6">
    <header><p className="text-xs font-semibold tracking-[0.16em] text-slate-500">YEAR TO DATE</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Your business at a glance</h1>
      {!data.completeness.isComplete && <p className="mt-2 text-sm text-slate-600">Some activity is still being processed.</p>}</header>
    <dl className="border-t border-slate-200">
      {metrics.map(([label, amount], index) => <div key={label} className={`grid grid-cols-[1fr_auto] items-baseline border-b border-slate-200 py-4 ${index === 2 ? 'font-semibold' : ''}`}>
        <dt>{label}</dt><dd className={`${index === 2 ? 'text-2xl' : 'text-xl'} tabular-nums`}>{usd.format(amount / 100)}</dd></div>)}
    </dl>
    <section aria-labelledby="category-heading"><h2 id="category-heading" className="text-lg font-semibold text-slate-950">Business expenses by category</h2>
      <p className="mt-1 text-sm text-slate-600">Only supported categories are shown. WriteOffs does not guess when a category is still being worked on.</p>
      <div className="mt-4 border-t border-slate-200">{data.categoryTotals.map((row) => <div key={row.categoryKey} className="grid grid-cols-[1fr_auto] gap-4 border-b border-slate-200 py-3 text-sm">
        <span>{row.categoryLabel}</span><span className="tabular-nums">{usd.format(row.amountCents / 100)}</span></div>)}
        {data.categoryTotals.length === 0 && <p className="py-5 text-sm text-slate-600">No supported category totals are available yet.</p>}</div>
    </section>
    <section aria-labelledby="mileage-heading"><h2 id="mileage-heading" className="text-lg font-semibold text-slate-950">Business mileage</h2>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{(data.businessMilesMilli / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })} miles</p>
      {data.mileageTaxTreatmentStatus === 'facts_only' && <p className="mt-2 text-sm text-slate-600">Mileage is preserved for tax preparation. WriteOffs has not guessed a vehicle expense method or deduction.</p>}
    </section>
    <section aria-labelledby="contractor-heading"><div className="flex items-center justify-between gap-4"><h2 id="contractor-heading" className="text-lg font-semibold text-slate-950">Contractor payments</h2><a href="/contractors" className="text-sm font-semibold text-[#243186]">Manage details</a></div>
      <div className="mt-4 border-t border-slate-200">{data.contractorSummaries.filter(row=>row.totalPaidCents>0).map(row=><div key={row.id} className="grid gap-1 border-b border-slate-200 py-4 sm:grid-cols-[1fr_auto] sm:gap-5"><div><p className="font-medium">{row.displayName}</p><p className="text-sm text-slate-600">W-9: {row.w9Status.replaceAll('_',' ')} · {row.awareness.replaceAll('_',' ')}</p></div><p className="font-medium tabular-nums">{usd.format(row.totalPaidCents/100)}</p></div>)}{data.contractorSummaries.every(row=>row.totalPaidCents===0)&&<p className="py-5 text-sm text-slate-600">No contractor payments are currently tracked.</p>}</div>
    </section>
    {data.completeness.unresolvedTaxTreatmentCount>0&&<section className="border-t border-slate-200 pt-7"><h2 className="text-lg font-semibold text-slate-950">Tax details still being checked</h2><p className="mt-2 text-sm text-slate-600">{data.completeness.unresolvedTaxTreatmentCount} business expense {data.completeness.unresolvedTaxTreatmentCount===1?'needs':'need'} more supported tax-treatment information. No deduction has been assumed.</p></section>}
  </main>
}
