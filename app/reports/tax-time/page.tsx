import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../../utils/supabase/server'
import { getAuthenticatedTaxYearReadiness, validateTaxYear } from '../../lib/bookkeeping/tax-year-readiness-service'
import { loadCustomerEntitlements } from '../../lib/membership/entitlements'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default async function TaxTimePage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  let year: number
  try { year = validateTaxYear((await searchParams).year ?? new Date().getFullYear()) } catch { redirect('/reports/tax-time') }
  const membership = await loadCustomerEntitlements(supabase)
  if (membership.lifecycle === 'none' || !membership.plan) redirect('/membership')
  const isBusiness = membership.plan === 'business'
  const readiness = await getAuthenticatedTaxYearReadiness({ supabase, taxYear: year, scope: membership.plan,
    includeDataSourceHealth: !['expired_read_only','pending_deletion'].includes(membership.lifecycle) })
  const ready = readiness.status === 'ready'
  const customerIssues = readiness.issues.filter(issue => issue.kind === 'customer_action')
  const processing = readiness.status === 'still_processing'

  return <main className="app-page -mx-4 -mb-10 sm:-mx-6 lg:-mx-8"><div className="page-container max-w-5xl">
    <header className="max-w-3xl">
      <p className="text-xs font-semibold tracking-[0.16em] text-slate-500">TAX TIME</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-5">
        <div><h1 className="page-title">{ready ? 'Your books are ready for tax preparation.' : processing ? 'Betti is finishing your books.' : customerIssues.length ? 'Betti needs a few answers before your books are ready for tax preparation.' : 'Your year-end books need attention.'}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{ready
            ? isBusiness ? 'Betti has your business income and expenses organized for the year.' : 'Betti has your business expenses organized for the year.'
            : processing ? 'WriteOffs is still organizing a few records. Your report will be available when that work is complete.'
              : 'Check in with Betti to answer the facts still needed to finish your books.'}</p></div>
        <form><label className="text-sm font-medium text-slate-700">Tax year <input name="year" type="number" min="2000" max="2100" defaultValue={year} className="ml-2 w-24 rounded-md border border-slate-300 px-3 py-2" /></label>
          <button className="ml-2 min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold">View</button></form>
      </div>
      {ready && <p className="mt-3 text-sm text-slate-600">Send it to your tax preparer or use it while preparing your own return.</p>}
      {ready && readiness.reviewItems.length > 0 && <p className="mt-3 text-sm text-slate-600">I found {readiness.reviewItems.length} {readiness.reviewItems.length === 1 ? 'item' : 'items'} for you or your tax preparer to review. I included them in your Tax-Time Report.</p>}
      <div className="mt-6">{ready
        ? <a className="btn btn-primary min-h-12" href={`/api/reports/tax-time-report?year=${year}`}>Download Tax-Time Report <span aria-hidden="true">↓</span></a>
        : customerIssues.length > 0 && <Link className="btn btn-primary min-h-12" href="/check-in">Check in with Betti <span aria-hidden="true">→</span></Link>}</div>
    </header>

    {!ready && <section className="mt-8" aria-labelledby="remaining-details"><h2 id="remaining-details" className="text-lg font-semibold">What still needs attention</h2>
      <ul className="mt-3 space-y-3 text-sm text-slate-600">{readiness.issues.filter(issue => issue.kind !== 'documentation').map((issue, index) => <li key={`${issue.code}-${index}`}>
        <p className="font-medium text-slate-900">{issue.title}</p><p className="mt-1">{issue.detail}</p>
        {issue.actionHref && issue.actionHref !== '/check-in' && <Link href={issue.actionHref} className="mt-1 inline-flex min-h-11 items-center font-semibold text-[#243186]">View details</Link>}
      </li>)}</ul></section>}

    <section className="mt-10 border-t border-slate-200 pt-8"><h2 className="text-xl font-semibold text-slate-950">{year} summary</h2>
      {!isBusiness && <p className="mt-2 text-sm text-slate-600">Income is not tracked as part of this membership.</p>}
      <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">{isBusiness && <div className="border-b border-slate-200 py-3"><dt className="text-sm text-slate-600">Business income</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{usd.format(readiness.totals.businessIncomeCents / 100)}</dd></div>}
        <div className="border-b border-slate-200 py-3"><dt className="text-sm text-slate-600">Business expenses</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{usd.format(readiness.totals.businessExpensesCents / 100)}</dd></div>
        {isBusiness && <div className="border-b border-slate-200 py-3"><dt className="text-sm text-slate-600">Estimated business profit</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{usd.format(readiness.totals.businessProfitCents / 100)}</dd></div>}
        <div className="border-b border-slate-200 py-3"><dt className="text-sm text-slate-600">Business mileage</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{(readiness.totals.businessMilesMilli / 1000).toLocaleString('en-US')} miles</dd></div></dl>
    </section>

    {readiness.reviewItems.length > 0 && <section className="mt-10"><h2 className="text-xl font-semibold text-slate-950">Items for you or your tax preparer to review</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Your books can be ready even when a final return decision still needs your or a tax professional’s judgment.</p>
      <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">{readiness.reviewItems.map((item, index) => <article key={`${item.kind}-${index}`} className="py-4">
        <h3 className="font-medium text-slate-950">{item.title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
      </article>)}</div></section>}

    {!ready && readiness.issues.some(issue => issue.kind === 'documentation') && <p className="mt-8 text-sm text-slate-600">Available receipts and documents remain organized in WriteOffs. A missing receipt does not automatically make otherwise completed books unfinished.</p>}

    <section className="mt-10 border-t border-slate-200 pt-8"><h2 className="text-xl font-semibold text-slate-950">Supporting details</h2>
      <p className="mt-2 text-sm text-slate-600">Use these if you or your tax preparer needs the records behind the annual report.</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2"><a className="btn btn-secondary justify-between" href={`/api/export/csv?year=${year}`}>Download detailed transactions <span aria-hidden="true">↓</span></a>
        <a className="btn btn-secondary justify-between" href={`/api/mileage/export?year=${year}`}>Download mileage log <span aria-hidden="true">↓</span></a>
        <a className="btn btn-secondary justify-between" href={`/api/contractors/export?year=${year}`}>Download contractor details <span aria-hidden="true">↓</span></a>
        <Link className="btn btn-secondary justify-between" href={`/reports/schedule-c?year=${year}`}>View Schedule C categories <span aria-hidden="true">→</span></Link></div>
    </section>
    <p className="mt-10 max-w-3xl text-xs leading-5 text-slate-500">WriteOffs organizes bookkeeping and tax-time information. It does not prepare or file tax returns, or make final tax elections that require taxpayer or tax-professional judgment.</p>
  </div></main>
}
