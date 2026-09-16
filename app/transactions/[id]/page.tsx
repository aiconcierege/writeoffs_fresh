import { specialNatureLabel } from '../../lib/bookkeeping/special-transactions'
import { safeReturnTo, returnLabel, withReturnTo } from '../../lib/navigation-context'
import { decisionProgress } from '../../lib/bookkeeping/decision-progress'
import { SCHEDULE_C_OPERATING_CATEGORIES } from '../../lib/bookkeeping/operating-expense-classification'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createServerSupabase } from '../../../utils/supabase/server'
import { getTransactionDetailReadModel } from '../../lib/bookkeeping/transaction-read-model'
import { SupabaseBookkeepingRepository } from '../../lib/bookkeeping/supabase-repository'
import { CorrectionForm } from '../CorrectionForm'
import { purchaseReceiptEligible } from '../../lib/bookkeeping/receipt-eligibility'
import { ReceiptActions } from '../ReceiptActions'

export const dynamic = 'force-dynamic'
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default async function TransactionDetailPage({ params,searchParams }: { params: Promise<{ id: string }>;searchParams:Promise<{review?:string;snapshot?:string;event?:string;returnTo?:string}> }) {
  const supabase = await createServerSupabase(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { id } = await params
  const reviewContext=await searchParams
  const returnTo=safeReturnTo(reviewContext.returnTo)
  const detailContext=withReturnTo(`/transactions/${id}`,returnTo)
  const transaction = await getTransactionDetailReadModel({ supabase, userId: user.id, transactionId: id })
  if (!transaction) notFound()
  const {data:work}=transaction.recordId?await supabase.from('customer_transaction_work').select('needs_fact,historical_documentation,account_id').eq('record_id',transaction.recordId).maybeSingle():{data:null}
  const receiptEligible = purchaseReceiptEligible(transaction)
  const account = work?.account_id ? await supabase.from('financial_accounts').select('provider').eq('id',work.account_id).maybeSingle() : {data:null}
  const accountUse = work?.account_id ? await supabase.from('current_financial_account_use').select('id').eq('financial_account_id',work.account_id).maybeSingle() : {data:null}
  const progress = decisionProgress({ recordId:transaction.recordId ?? transaction.id,
    treatment:transaction.treatment, nature:transaction.bookkeepingNature, category:transaction.category_key,
    candidate:transaction.categoryCandidate, hasReceipt:transaction.has_receipt, receiptUnavailable:transaction.receiptLost,
    needsFact:Boolean(work?.needs_fact), accountUseNeeded:account.data?.provider === 'statement' && !accountUse.data,
    amountCents:transaction.amountCents,description:transaction.description ?? transaction.vendor })
  const categoryLabel = (key:string) => SCHEDULE_C_OPERATING_CATEGORIES[key as keyof typeof SCHEDULE_C_OPERATING_CATEGORIES] ?? key.replaceAll('-', ' ')
  let canMarkLost = false
  if (receiptEligible && transaction.recordId) {
    const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
    if (business) {
      const outstanding = await new SupabaseBookkeepingRepository(supabase).listOutstandingDocumentationRequests(business.id)
      canMarkLost = !transaction.has_receipt && !transaction.receiptLost && outstanding.some((event) => event.bookkeepingRecordId === transaction.recordId)
    }
  }
  return <main className="app-page"><article className="page-container page-container-narrow">
    <Link href={returnTo} className="text-sm text-slate-600 hover:text-slate-950">← {returnLabel(returnTo)}</Link>
    <header className="mt-6 border-b border-[#dce3de] pb-5 sm:mt-8 sm:pb-8"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div><h1 className="page-title mt-0">{transaction.vendor}</h1>
        <p className="mt-2 text-sm text-slate-600">{formatDate(transaction.date)}{transaction.sourceLabel ? ` · ${transaction.sourceLabel}` : ''}</p></div>
      <p className="money-display text-3xl font-semibold sm:text-right">{money.format(transaction.amount)}</p></div></header>
    <section className="grid gap-6 border-b border-slate-200 py-6 sm:grid-cols-2 sm:gap-8 sm:py-8">
      <div><h2 className="text-lg font-semibold text-slate-950">{specialNatureLabel(transaction.bookkeepingNature,transaction.treatment)??'How Betti handled this'}</h2>
        <p className="mt-3"><span className="status-badge">{transaction.treatment === 'unresolved' ? (progress.state === 'system_pending' ? 'Supporting records needed' : 'Needs your answer') : transaction.treatmentLabel}</span></p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{progress.message}</p>
        {(transaction.categoryKeys?.length || transaction.categoryCandidate) ? <div className="mt-4"><h3 className="text-sm font-semibold">{transaction.categoryKeys?.length ? 'Category' : 'Likely category'}</h3><p className="mt-1 text-sm">{(transaction.categoryKeys?.length ? transaction.categoryKeys : [transaction.categoryCandidate!]).map(categoryLabel).join(' · ')}</p></div> : null}
        {transaction.bookkeepingNature==='refund'&&transaction.treatment!=='unresolved'&&<Link className="btn btn-secondary" href={withReturnTo(`/check-in?record=${transaction.recordId}`,detailContext)}>Review return relationship</Link>}
        {progress.action && <Link href={withReturnTo(progress.action.href,detailContext)} className="inline-flex min-h-11 items-center font-semibold text-[#243186]">{progress.action.label} →</Link>}
        {transaction.contractorName && <p className="mt-2 text-sm text-slate-600">Contractor: <span className="font-medium text-slate-900">{transaction.contractorName}</span></p>}
        {transaction.sourceModel==='canonical'&&transaction.currentDecisionId&&transaction.treatment==='personal'
          ?<CorrectionForm currentTreatment={transaction.treatment??undefined} transactionId={transaction.id} currentDecisionId={transaction.currentDecisionId} totalCents={transaction.amountCents} restoreMode="personal"/>
          :transaction.sourceModel==='canonical'&&transaction.currentDecisionId&&transaction.treatment==='excluded'&&transaction.decisionProvenance==='user'
          ?<CorrectionForm currentTreatment={transaction.treatment??undefined} transactionId={transaction.id} currentDecisionId={transaction.currentDecisionId} totalCents={transaction.amountCents} restoreMode="exclusion"/>
          :transaction.sourceModel === 'canonical' && transaction.sourceKind !== 'manual' && transaction.bookkeepingNature === 'expense' && transaction.currentDecisionId
          ? <CorrectionForm currentTreatment={transaction.treatment??undefined} transactionId={transaction.id} currentDecisionId={transaction.currentDecisionId} totalCents={transaction.amountCents}
              reviewContext={reviewContext.review&&reviewContext.snapshot&&reviewContext.event?{reviewPeriodId:reviewContext.review,reviewSnapshotId:reviewContext.snapshot,expectedReviewEventId:reviewContext.event}:undefined}/>
          : null}</div>
      {(receiptEligible || transaction.has_receipt) && <div><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{receiptEligible ? 'Receipt and documentation' : 'Supporting records'}</h2>
        <p className="mt-3 font-medium text-slate-950">{transaction.has_receipt ? 'Supporting receipt attached' : transaction.receiptLost ? 'Receipt reported unavailable' : 'No receipt attached'}</p>
        {work?.historical_documentation&&<p className="mt-2 text-sm leading-6 text-slate-600">This older meal is missing details about who was there or its business purpose. Keep any records you find; missing facts have not been assumed.</p>}
        {transaction.receiptLost && <p className="mt-2 text-sm leading-6 text-slate-600">The prior Receipt Lost history is preserved. You can still attach it later if you find it.</p>}
        {transaction.sourceModel === 'canonical' && transaction.recordId && <ReceiptActions transactionId={transaction.id} recordId={transaction.recordId} useRecordTarget={transaction.id === transaction.recordId} date={transaction.date} amount={transaction.amount} vendor={transaction.vendor}
          links={transaction.evidenceLinks} canMarkLost={canMarkLost} />}</div>}
    </section>
    {transaction.sourceModel === 'canonical' && transaction.history.length > 0 && <section className="py-6 sm:py-8"><h2 className="text-lg font-semibold text-slate-950">History</h2>
      <ol className="mt-4 space-y-4">{transaction.history.map((item) => <li key={item.id} className="border-l border-slate-300 pl-4"><p className="font-medium text-slate-900">{item.summary}</p>
        {item.explanation && <p className="mt-1 text-sm text-slate-600">{item.explanation}</p>}<time className="mt-1 block text-xs text-slate-500">{new Date(item.createdAt).toLocaleDateString('en-US')}</time></li>)}</ol></section>}
  </article></main>
}

function formatDate(value:string){return new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`))}
