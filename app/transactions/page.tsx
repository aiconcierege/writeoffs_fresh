import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { listTransactionReadModel } from '../lib/bookkeeping/transaction-read-model'

export const dynamic = 'force-dynamic'
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default async function TransactionsPage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const params = await searchParams
  const query = (Array.isArray(params.q) ? params.q[0] : params.q ?? '').trim().slice(0, 100)
  let rows = await listTransactionReadModel({ supabase, userId: user.id, limit: 1000 })
  if (query) {
    const needle = query.toLowerCase()
    rows = rows.filter((row) => `${row.vendor} ${row.description ?? ''}`.toLowerCase().includes(needle))
  }
  return <main className="min-h-screen bg-[#fbfbfa]">
    <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-col gap-6 border-b border-slate-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-3xl font-semibold tracking-[-0.025em] text-slate-950">Transactions</h1>
          <p className="mt-2 text-sm text-slate-600">A clear history of your business activity.</p></div>
        <form className="w-full sm:max-w-xs"><label htmlFor="transaction-search" className="sr-only">Search transactions</label>
          <input id="transaction-search" name="q" defaultValue={query} placeholder="Search merchant or description"
            className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-[#243186] focus:ring-2 focus:ring-[#243186]/15" /></form>
      </div>
      {rows.length === 0 ? <div className="py-16 text-center"><h2 className="text-lg font-medium text-slate-950">{query ? 'No matching transactions' : 'No transactions yet'}</h2>
        <p className="mt-2 text-sm text-slate-600">{query ? 'Try a different search.' : 'Financial activity will appear here as WriteOffs processes it.'}</p></div>
      : <div className="divide-y divide-slate-200">
        {rows.map((row) => <Link key={`${row.sourceModel}:${row.id}`} href={`/transactions/${row.id}`}
          className="grid grid-cols-[1fr_auto] gap-4 py-5 transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#243186] sm:grid-cols-[7rem_1fr_12rem_8rem] sm:items-center sm:px-2">
          <time className="hidden text-sm text-slate-500 sm:block">{formatDate(row.date)}</time>
          <div className="min-w-0"><p className="truncate font-medium text-slate-950">{row.vendor}</p>
            <p className="mt-1 text-xs text-slate-500 sm:hidden">{formatDate(row.date)}</p>
            <p className="mt-1 text-sm text-slate-600">{row.treatmentLabel}</p></div>
          <div className="hidden text-sm text-slate-600 sm:block">{row.has_receipt ? 'Receipt attached' : row.receiptLost ? 'Receipt unavailable' : 'No receipt attached'}</div>
          <p className={`text-right font-medium tabular-nums ${row.amountCents < 0 ? 'text-slate-950' : 'text-emerald-800'}`}>{money.format(row.amount)}</p>
        </Link>)}
      </div>}
    </section>
  </main>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}
