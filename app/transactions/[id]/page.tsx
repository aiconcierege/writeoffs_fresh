import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createServerSupabase } from '../../../utils/supabase/server'
import { getTransactionDetailReadModel } from '../../lib/bookkeeping/transaction-read-model'
import { SupabaseBookkeepingRepository } from '../../lib/bookkeeping/supabase-repository'
import { CorrectionForm } from '../CorrectionForm'
import { ReceiptActions } from '../ReceiptActions'

export const dynamic = 'force-dynamic'
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { id } = await params
  const transaction = await getTransactionDetailReadModel({ supabase, userId: user.id, transactionId: id })
  if (!transaction) notFound()
  let canMarkLost = false
  if (transaction.recordId) {
    const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
    if (business) {
      const outstanding = await new SupabaseBookkeepingRepository(supabase).listOutstandingDocumentationRequests(business.id)
      canMarkLost = outstanding.some((event) => event.bookkeepingRecordId === transaction.recordId)
    }
  }
  return <main className="min-h-screen bg-[#fbfbfa]"><article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
    <Link href="/transactions" className="text-sm text-slate-600 hover:text-slate-950">← Transactions</Link>
    <header className="mt-8 border-b border-slate-200 pb-8"><div className="flex items-start justify-between gap-6">
      <div><h1 className="text-3xl font-semibold tracking-[-0.025em] text-slate-950">{transaction.vendor}</h1>
        <p className="mt-2 text-sm text-slate-600">{transaction.date}{transaction.sourceLabel ? ` · ${transaction.sourceLabel}` : ''}</p></div>
      <p className="text-2xl font-semibold tabular-nums text-slate-950">{money.format(transaction.amount)}</p></div></header>
    <section className="grid gap-8 border-b border-slate-200 py-8 sm:grid-cols-2">
      <div><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">What WriteOffs knows</h2>
        <p className="mt-3 font-medium text-slate-950">{transaction.treatmentLabel}</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{transaction.decisionReason ?? (transaction.sourceModel === 'canonical' ? 'WriteOffs is still working on this transaction.' : 'This is a historical transaction.')}</p>
        {transaction.sourceModel === 'canonical' && transaction.bookkeepingNature === 'expense' && transaction.currentDecisionId
          ? <CorrectionForm transactionId={transaction.id} currentDecisionId={transaction.currentDecisionId} totalCents={transaction.amountCents} />
          : transaction.sourceModel === 'canonical' && transaction.treatment === 'unresolved'
            ? <Link href="/questions" className="mt-4 inline-block text-sm font-semibold text-[#243186]">Answer questions →</Link> : null}</div>
      <div><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Receipt and documentation</h2>
        <p className="mt-3 font-medium text-slate-950">{transaction.has_receipt ? 'Supporting receipt attached' : transaction.receiptLost ? 'Receipt reported unavailable' : 'No receipt attached'}</p>
        {transaction.receiptLost && <p className="mt-2 text-sm leading-6 text-slate-600">The prior Receipt Lost history is preserved. You can still attach it later if you find it.</p>}
        {transaction.sourceModel === 'canonical' && <ReceiptActions transactionId={transaction.id} date={transaction.date} amount={transaction.amount} vendor={transaction.vendor}
          links={transaction.evidenceLinks} canMarkLost={canMarkLost} />}</div>
    </section>
    {transaction.sourceModel === 'canonical' && transaction.history.length > 1 && <section className="py-8"><h2 className="text-lg font-semibold text-slate-950">History</h2>
      <ol className="mt-4 space-y-4">{transaction.history.map((item) => <li key={item.id} className="border-l border-slate-300 pl-4"><p className="font-medium text-slate-900">{item.summary}</p>
        {item.explanation && <p className="mt-1 text-sm text-slate-600">{item.explanation}</p>}<time className="mt-1 block text-xs text-slate-500">{new Date(item.createdAt).toLocaleDateString('en-US')}</time></li>)}</ol></section>}
  </article></main>
}
