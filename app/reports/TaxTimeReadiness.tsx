import Link from 'next/link'
import type { getAuthenticatedTaxYearReadiness } from '../lib/bookkeeping/tax-year-readiness-service'

type Readiness = Awaited<ReturnType<typeof getAuthenticatedTaxYearReadiness>>
export function TaxTimeReadiness({ readiness }: { readiness: Readiness }) {
  const ready = readiness.status === 'ready'
  const customerIssues = readiness.issues.filter(issue => issue.kind === 'customer_action')
  return <section aria-labelledby="tax-time-heading" className="border-b border-slate-200 pb-8">
    <p className="text-xs font-semibold tracking-widest text-slate-500">{readiness.taxYear} TAX-TIME REPORT</p>
    <h2 id="tax-time-heading" className="mt-2 text-2xl font-semibold text-slate-950">{ready
      ? 'Your books are ready for tax preparation.'
      : customerIssues.length ? 'Betti needs a few answers to finish your books.'
        : 'Betti is checking your year-end books.'}</h2>
    <p className="mt-3 text-sm leading-6 text-slate-600">{ready
      ? readiness.scope === 'business' ? 'Betti has your business income and expenses organized for the year.' : 'Betti has your business expenses organized for the year.'
      : customerIssues.length ? 'Check in with Betti to fill in the missing details.'
        : 'View your annual report to see what still needs attention.'}</p>
    {ready && readiness.reviewItems.length > 0 && <p className="mt-2 text-sm text-slate-600">I found {readiness.reviewItems.length} {readiness.reviewItems.length === 1 ? 'item' : 'items'} for you or your tax preparer to review. I included them in your Tax-Time Report.</p>}
    <div className="mt-5 flex flex-wrap items-center gap-4">{ready
      ? <a className="btn btn-primary min-h-12" href={`/api/reports/tax-time-report?year=${readiness.taxYear}`}>Download Tax-Time Report</a>
      : customerIssues.length > 0 && <Link href="/check-in" className="btn btn-primary min-h-12">Check in with Betti</Link>}
      <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]" href={`/reports/tax-time?year=${readiness.taxYear}`}>View annual details or choose another year</Link></div>
    {ready && <p className="mt-3 text-sm text-slate-600">Send it to your tax preparer or use it while preparing your own return.</p>}
  </section>
}
