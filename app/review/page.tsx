/* File: app/review/page.tsx
 * Version: v15 (remove pack column; mint chips)
 * Date: 2025-11-04
 */
import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import BulkTable from './BulkTable'
import { listTransactionReadModel } from '../lib/bookkeeping/transaction-read-model'

type Tx = {
  id: string
  date: string
  vendor: string
  description: string | null
  amount: string | number
  category_key: string | null
  receipt_waived?: boolean
  created_from_receipt_id?: string | null
  has_receipt?: boolean
  sourceModel: 'canonical' | 'legacy'
  treatmentLabel: string
  decisionReason: string | null
  decisionProvenance: string | null
  correctionCount: number
}
type Category = { key: string; label: string }

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createServerSupabase()

  // Auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Params
  const sp = await searchParams
  const read = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v
  const needsRaw = read(sp.needs)
  const needsReceiptRaw = read(sp.needs_receipt)

  const needsOnly = needsRaw === '1'
  const needsReceiptOnly = needsReceiptRaw === '1'

  // Categories
  const { data: categories = [] } = await supabase
    .from('categories')
    .select('key,label')
    .order('label', { ascending: true })

  let error: Error | null = null
  let txsAll: Tx[] = []
  try {
    txsAll = await listTransactionReadModel({ supabase, userId: user.id, limit: 1000 })
  } catch (caught) {
    error = caught instanceof Error ? caught : new Error('Could not list transactions.')
  }
  if (needsOnly) {
    txsAll = txsAll.filter((transaction) => transaction.sourceModel === 'canonical'
      ? transaction.treatmentLabel === 'Still being worked on'
      : transaction.category_key === null)
  }

  // Needs-receipt filter = no receipt and not waived
  const txs = needsReceiptOnly
    ? txsAll.filter(t => !t.has_receipt && !t.receipt_waived)
    : txsAll

  // Export links
  const expQS = new URLSearchParams()
  if (needsOnly) expQS.set('needs', '1')
  const exportHref = expQS.toString() ? `/export?${expQS.toString()}` : '/export'

  const needsQS = new URLSearchParams()
  needsQS.set('needs', '1')
  const exportNeedsHref = `/export?${needsQS.toString()}`

  // Needs-receipt pill link
  const baseQS = new URLSearchParams()
  if (needsOnly) baseQS.set('needs', '1')
  const hrefNeedsReceipt =
    needsReceiptOnly
      ? `/review?${baseQS.toString()}`
      : (baseQS.toString()
          ? `/review?${baseQS.toString()}&needs_receipt=1`
          : `/review?needs_receipt=1`)

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Review transactions</h1>
            <p className="mt-1 text-sm text-neutral-700">
              {error ? (
                <span className="text-red-700">Error: {error.message}</span>
              ) : (
                <>Showing {txs.length} row{txs.length === 1 ? '' : 's'}
                  {needsOnly ? ' (uncategorized only)' : ''}
                  {needsReceiptOnly ? ' (needs receipt)' : ''}.
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/review"
              className={`chip ${!needsOnly && !needsReceiptOnly ? 'chip-active-mint' : ''}`}
            >
              All
            </a>
            <a
              href={`/review?needs=1`}
              className={`chip ${needsOnly ? 'chip-active-mint' : ''}`}
              title="Only uncategorized transactions"
            >
              Needs category
            </a>
            <a
              href={hrefNeedsReceipt}
              className={`chip ${needsReceiptOnly ? 'chip-active-mint' : ''}`}
              title="No receipt attached and not waived"
            >
              Needs receipt
            </a>

            {/* Exports */}
            <a
              href={exportHref}
              className="btn btn-secondary ml-3"
              title="Open export page with these filters"
            >
              Export CSV (this view)
            </a>
            <a
              href={exportNeedsHref}
              className="btn btn-secondary"
              title="Open export page for uncategorized only"
            >
              Export uncategorized
            </a>
          </div>
        </div>

        <BulkTable txs={txs as Tx[]} categories={categories as Category[]} />
      </section>
    </main>
  )
}
