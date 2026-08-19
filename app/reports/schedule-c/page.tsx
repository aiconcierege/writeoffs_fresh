import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../../utils/supabase/server'
import { getAuthenticatedCanonicalReport } from '../../lib/bookkeeping/reporting-service'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default async function TaxCategorySummary() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const today = new Date().toISOString().slice(0, 10)
  const report = await getAuthenticatedCanonicalReport({ supabase,
    periodStart: `${today.slice(0, 4)}-01-01`, periodEnd: today })
  return <main className="mx-auto max-w-4xl px-6 py-10">
    <header><h1 className="text-3xl font-semibold tracking-tight">Tax category summary</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">A preparation summary of supported business categories. This is not a tax return, and activity still being worked on is not guessed into a category.</p></header>
    <div className="mt-7 overflow-x-auto border-y border-slate-200"><table className="min-w-full text-left text-sm">
      <thead><tr className="text-slate-600"><th className="py-3 font-medium">Category</th><th className="py-3 text-right font-medium">Transactions</th><th className="py-3 text-right font-medium">Business amount</th></tr></thead>
      <tbody>{report.categoryTotals.map((row) => <tr key={row.categoryKey} className="border-t border-slate-200"><td className="py-3">{row.categoryLabel}</td><td className="py-3 text-right">{row.transactionCount}</td><td className="py-3 text-right tabular-nums">{usd.format(row.amountCents / 100)}</td></tr>)}
        {report.categoryTotals.length === 0 && <tr className="border-t border-slate-200"><td colSpan={3} className="py-7 text-center text-slate-600">No supported category totals are available yet.</td></tr>}</tbody>
    </table></div>
    {report.uncategorizedBusinessExpensesCents !== 0 && <p className="mt-4 text-sm text-slate-600">Some business expenses are not included in the category breakdown while WriteOffs finishes their treatment.</p>}
    <div className="mt-7 flex gap-3"><Link href="/export" className="rounded-md border border-slate-300 px-3 py-2 text-sm">Export CSV</Link><Link href="/transactions" className="rounded-md border border-slate-300 px-3 py-2 text-sm">Back to Transactions</Link></div>
  </main>
}
