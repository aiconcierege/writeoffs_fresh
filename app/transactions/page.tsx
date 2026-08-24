import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { listTransactionReadModel } from '../lib/bookkeeping/transaction-read-model'
import { EmptyState, PageContainer, PageHeader, StatusBadge } from '../components/ui'

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
  return <main className="app-page">
    <PageContainer wide>
      <PageHeader title="Transactions" description="A clear history of your business activity."
        actions={<form className="w-full sm:w-80"><label htmlFor="transaction-search" className="sr-only">Search transactions</label>
          <input id="transaction-search" name="q" defaultValue={query} placeholder="Search merchant or description"
            className="field text-sm" /></form>} />
      {rows.length === 0 ? <EmptyState title={query ? 'No matching transactions' : 'No activity yet'}
        description={query ? 'Try a different search.' : 'Connect or import an account and WriteOffs will start organizing it.'}
        action={query ? null : <div className="flex flex-col justify-center gap-3 sm:flex-row"><Link href="/settings/banking" className="btn btn-primary">Connect an account</Link><Link href="/import" className="btn btn-secondary">Import a CSV</Link></div>} />
      : <div className="record-list mt-8">
        {rows.map((row) => <Link key={`${row.sourceModel}:${row.id}`} href={`/transactions/${row.id}`}
          className="record-row grid min-h-[5.25rem] grid-cols-[1fr_auto] gap-4 px-1 py-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#243186] sm:grid-cols-[7rem_1fr_12rem_8rem] sm:items-center sm:px-3">
          <time className="hidden text-sm text-slate-500 sm:block">{formatDate(row.date)}</time>
          <div className="min-w-0"><p className="truncate font-medium text-slate-950">{row.vendor}</p>
            <p className="mt-1 text-xs text-slate-500 sm:hidden">{formatDate(row.date)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge tone={row.treatmentLabel === 'Business' ? 'positive' : row.treatmentLabel.includes('working') ? 'attention' : 'muted'}>{row.treatmentLabel}</StatusBadge>{row.sourceLabel&&<span className="text-xs text-slate-500">{row.sourceLabel}</span>}</div></div>
          <div className="hidden text-sm text-slate-600 sm:block">{row.has_receipt ? 'Receipt attached' : row.receiptLost ? 'Receipt unavailable' : 'No receipt'}</div>
          <p className={`money-display text-right text-base font-semibold ${row.amountCents > 0 ? 'money-positive' : ''}`}>{money.format(row.amount)}</p>
        </Link>)}
      </div>}
    </PageContainer>
  </main>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}
