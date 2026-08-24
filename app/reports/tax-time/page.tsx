import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../../utils/supabase/server'
import { getAuthenticatedTaxYearReadiness, validateTaxYear } from '../../lib/bookkeeping/tax-year-readiness-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const labels = { ready: 'Ready', needs_attention: 'Needs attention', still_processing: 'Still processing', incomplete: 'Incomplete',
  complete: 'Complete', good: 'Good', not_applicable: 'Not applicable' }

export default async function TaxTimePage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  let year: number
  try { year = validateTaxYear((await searchParams).year ?? new Date().getFullYear()) } catch { redirect('/reports/tax-time') }
  const readiness = await getAuthenticatedTaxYearReadiness({ supabase, taxYear: year })
  const customerIssues = readiness.issues.filter(issue => issue.kind !== 'processing')
  const processingIssues = readiness.issues.filter(issue => issue.kind === 'processing')
  return <main className="page-container max-w-5xl">
    <header className="max-w-3xl"><p className="text-xs font-semibold tracking-[0.16em] text-slate-500">ANNUAL RECORDS</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="page-title">{year} tax-time readiness</h1>
        <p className="mt-4"><span className="status-badge" data-tone={readiness.status === 'ready' ? 'positive' : readiness.status === 'still_processing' ? 'muted' : 'attention'}>{labels[readiness.status]}</span></p></div>
        <form><label className="text-sm font-medium text-slate-700">Tax year <input name="year" type="number" min="2000" max="2100" defaultValue={year} className="ml-2 w-24 rounded-md border border-slate-300 px-3 py-2" /></label>
          <button className="ml-2 min-h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold">View</button></form></div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{readiness.status === 'ready' ? `Your ${year} records are ready for tax preparation.`
        : readiness.status === 'still_processing' ? 'WriteOffs is still working on your records.'
          : readiness.status === 'needs_attention' ? `${readiness.issues.length} ${readiness.issues.length === 1 ? 'thing needs' : 'things need'} attention.`
            : `We’re missing information needed to finish your ${year} records.`}</p>
    </header>
    <section className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Readiness details">
      {readiness.dimensions.map(dimension => <article key={dimension.key} className="border-b border-[#dce3de] px-1 py-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-slate-950">{dimension.label}</h2><span className="status-badge" data-tone={dimension.status === 'complete' || dimension.status === 'good' ? 'positive' : dimension.status === 'not_applicable' || dimension.status === 'still_processing' ? 'muted' : 'attention'}>{labels[dimension.status]}</span></div><p className="mt-2 text-sm leading-6 text-slate-600">{dimension.summary}</p></article>)}
    </section>
    <section className="mt-10 border-t border-slate-200 pt-8"><h2 className="text-xl font-semibold text-slate-950">Annual summary</h2>
      <dl className="mt-4 grid gap-x-8 sm:grid-cols-2"><div className="border-b border-slate-200 py-3"><dt className="text-sm text-slate-600">Business income</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{usd.format(readiness.totals.businessIncomeCents/100)}</dd></div><div className="border-b border-slate-200 py-3"><dt className="text-sm text-slate-600">Business expenses</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{usd.format(readiness.totals.businessExpensesCents/100)}</dd></div><div className="border-b border-slate-200 py-3"><dt className="text-sm text-slate-600">Business profit</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{usd.format(readiness.totals.businessProfitCents/100)}</dd></div><div className="border-b border-slate-200 py-3"><dt className="text-sm text-slate-600">Business mileage</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{(readiness.totals.businessMilesMilli/1000).toLocaleString('en-US')} miles</dd></div></dl>
    </section>
    {customerIssues.length > 0 && <section className="mt-10"><h2 className="text-xl font-semibold text-slate-950">Needs attention</h2><div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">{customerIssues.map((issue,index)=><div key={`${issue.code}-${index}`} className="py-4"><h3 className="font-medium text-slate-950">{issue.title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{issue.detail}</p>{issue.actionHref&&<Link href={issue.actionHref} className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-[#243186]">Take care of this →</Link>}</div>)}</div></section>}
    {processingIssues.length > 0 && <section className="notice mt-9"><h2 className="font-semibold text-slate-950">WriteOffs is still working</h2>{processingIssues.map((issue,index)=><p key={index} className="mt-2 text-sm text-slate-600">{issue.detail}</p>)}</section>}
    <section className="mt-10 border-t border-slate-200 pt-8"><h2 className="text-xl font-semibold text-slate-950">Download tax records</h2><p className="mt-2 text-sm text-slate-600">Download your current business activity and factual summaries for your tax preparer.</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2"><a className="btn btn-secondary justify-between" href={`/api/export/csv?year=${year}`}>Transaction CSV <span aria-hidden="true">↓</span></a><a className="btn btn-secondary justify-between" href={`/api/mileage/export?year=${year}`}>Mileage CSV <span aria-hidden="true">↓</span></a><a className="btn btn-secondary justify-between" href={`/api/contractors/export?year=${year}`}>Contractor CSV <span aria-hidden="true">↓</span></a><a className="btn btn-secondary justify-between" href={`/api/reports/annual-package?year=${year}&file=documentation`}>Documentation summary <span aria-hidden="true">↓</span></a><a className="btn btn-secondary justify-between" href={`/api/reports/annual-package?year=${year}&file=unresolved-items`}>Unresolved items <span aria-hidden="true">↓</span></a><Link className="btn btn-secondary justify-between" href={`/reports/schedule-c?year=${year}`}>Schedule C categories <span aria-hidden="true">→</span></Link></div>
    </section>
    <p className="mt-10 max-w-3xl text-xs leading-5 text-slate-500">{readiness.caveat} {readiness.dataSourceLimitation}</p>
  </main>
}
