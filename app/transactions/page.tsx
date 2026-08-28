import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { listTransactionReadModel, parseTransactionCursor, transactionCursor } from '../lib/bookkeeping/transaction-read-model'
import { EmptyState, PageContainer, PageHeader, StatusBadge } from '../components/ui'

export const dynamic = 'force-dynamic'
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default async function TransactionsPage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[]; cursor?: string | string[] }>
}) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const params = await searchParams
  const query = (Array.isArray(params.q) ? params.q[0] : params.q ?? '').trim().slice(0, 100)
  const cursorValue=Array.isArray(params.cursor)?params.cursor[0]:params.cursor
  const after=query?null:parseTransactionCursor(cursorValue)
  let rows = await listTransactionReadModel({ supabase, userId: user.id, limit: query?1000:101,after })
  if (query) {
    const needle = query.toLowerCase()
    rows = rows.filter((row) => `${row.vendor} ${row.description ?? ''}`.toLowerCase().includes(needle))
  }
  const hasMore=!query&&rows.length>100;if(hasMore)rows=rows.slice(0,100)
  const nextCursor=hasMore&&rows.length?transactionCursor(rows[rows.length-1]):null
  return <main className="app-page">
    <PageContainer wide>
      <PageHeader eyebrow="Your books" title="Transactions" description="Here’s everything WriteOffs is keeping track of for your business."
        actions={<form className="w-full sm:w-80"><label htmlFor="transaction-search" className="sr-only">Search transactions</label>
          <input id="transaction-search" name="q" defaultValue={query} placeholder="Search merchant or description"
            className="field text-sm" /></form>} />
      {rows.length === 0 ? <EmptyState title={query ? 'No matching transactions' : 'No activity yet'}
        description={query ? 'Try a different search.' : 'Connect or import an account and WriteOffs will start organizing it.'}
        action={query ? null : <div className="flex flex-col justify-center gap-3 sm:flex-row"><Link href="/settings/banking" className="btn btn-primary">Connect an account</Link><Link href="/import" className="btn btn-secondary">Import a CSV</Link></div>} />
      : <div className="record-list transaction-records mt-8">
        {rows.map((row) => <Link key={`${row.sourceModel}:${row.id}`} href={`/transactions/${row.id}`}
          className="record-row transaction-record-row grid min-h-[5.75rem] grid-cols-[1fr_auto] gap-4 px-2 py-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#243186] sm:grid-cols-[8rem_1fr_13rem_9rem] sm:items-center sm:px-4">
          <time className="hidden text-base text-slate-600 sm:block">{formatDate(row.date)}</time>
          <div className="min-w-0"><p className="truncate text-lg font-semibold text-slate-950">{row.vendor}</p>
            <p className="mt-1 text-xs text-slate-500 sm:hidden">{formatDate(row.date)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge tone={row.treatmentLabel === 'Business' ? 'positive' : row.treatmentLabel.includes('working') ? 'attention' : 'muted'}>{row.treatmentLabel}</StatusBadge>{row.sourceLabel&&<span className="text-xs text-slate-500">{row.sourceLabel}</span>}</div></div>
          <div className="hidden text-base font-medium text-slate-600 sm:block">{row.has_receipt ? 'Receipt attached' : row.receiptLost ? 'Receipt unavailable' : 'No receipt'}</div>
          <p className={`money-display text-right text-base font-semibold ${row.amountCents > 0 ? 'money-positive' : ''}`}>{money.format(row.amount)}</p>
        </Link>)}
      </div>}
      {nextCursor&&<div className="mt-8 flex justify-center"><Link className="btn btn-secondary" href={`/transactions?cursor=${encodeURIComponent(nextCursor)}`}>Older activity</Link></div>}
    </PageContainer>
  </main>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}
