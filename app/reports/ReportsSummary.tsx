'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

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

export function ReportsSummary({scope,readOnly}:{scope:'expenses'|'business';readOnly:boolean}) {
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch('/api/reports/summary', { cache: 'no-store' })
    .then((response) => response.ok ? response.json() : null).then(setData)
    .catch(() => setData(null)).finally(() => setLoading(false)) }, [])
  if (loading) return <div role="status" aria-label="Loading report" className="page-container"><div className="skeleton h-12 max-w-md"/><div className="mt-8 grid gap-5 sm:grid-cols-2"><div className="skeleton h-28"/><div className="skeleton h-28"/></div></div>
  if (!data) return <div className="page-container"><div role="alert" className="notice notice-error">Your report is temporarily unavailable. Please try again.</div></div>
  return <main className="page-container max-w-5xl space-y-11">
    <header><p className="text-xs font-semibold tracking-[0.16em] text-slate-500">YEAR TO DATE</p>
      <h1 className="page-title">{scope==='business'?'Your business at a glance':'Your expenses at a glance'}</h1>
      {readOnly&&<p className="mt-2 text-sm font-medium text-[#243186]">Historical records · read only</p>}
      {!data.completeness.isComplete && <p className="mt-2 text-sm text-slate-600">Some activity is still being processed.</p>}
      <Link href="/reports/tax-time" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">Check tax-time readiness →</Link></header>
    <section aria-labelledby="financial-summary-heading"><h2 id="financial-summary-heading" className="sr-only">Financial summary</h2>
      <dl className="grid border-t border-[#dce3de] sm:grid-cols-2 sm:gap-x-10">
        {scope==='business'&&<div className="border-b border-[#dce3de] py-5"><dt className="text-sm text-[#59665f]">Business income</dt><dd className="money-display mt-2 text-3xl font-semibold">{usd.format(data.businessIncomeCents / 100)}</dd></div>}
        <div className="border-b border-[#dce3de] py-5"><dt className="text-sm text-[#59665f]">Business expenses</dt><dd className="money-display mt-2 text-3xl font-semibold">{usd.format(data.businessExpensesCents / 100)}</dd></div>
        {scope==='business'&&<div className="py-7 sm:col-span-2"><dt className="font-medium text-[#17211d]">Estimated business profit</dt><dd className="money-display mt-2 text-4xl font-semibold sm:text-5xl">{usd.format(data.businessProfitCents / 100)}</dd></div>}
      </dl>
      {data.estimatedDeductionsCents != null && <div className="mt-3 max-w-xl border-l-2 border-[#9ccdbc] pl-4"><p className="eyebrow">Tax estimate</p><p className="mt-2 text-sm text-[#59665f]">Estimated deductions</p><p className="money-display mt-1 text-2xl font-semibold">{usd.format(data.estimatedDeductionsCents / 100)}</p></div>}
    </section>
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
