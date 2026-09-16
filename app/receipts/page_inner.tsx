'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReceiptReadItem } from '../lib/bookkeeping/receipt-workflow'
import { ReceiptUploadAction } from './ReceiptUploadAction'
import { centsToDollars, validateReceiptFacts, type ReceiptFactErrors } from './receipt-form'
import { BettiPageIntro, EmptyState, PageContainer } from '../components/ui'

const PAGE_SIZE = 50
type ReceiptFilter = 'all' | 'matched' | 'without_match' | 'attention'

export default function ReceiptsInner() {
  const [receipts, setReceipts] = useState<ReceiptReadItem[]>([])
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [hasMore, setHasMore] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ReceiptFilter>('all')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (requestedLimit = PAGE_SIZE) => {
    const response = await fetch(`/api/receipts?limit=${requestedLimit}`, { cache: 'no-store' })
    if (response.status === 401) { window.location.href = '/login'; return }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error('LOAD_FAILED')
    const next = data.receipts ?? []
    setReceipts(next); setHasMore(next.length === requestedLimit)
    setLoading(false)
  }, [])

  useEffect(() => { void refresh(PAGE_SIZE).catch(() => { setError('Receipts could not be loaded. Try refreshing.'); setLoading(false) }) }, [refresh])

  const processing = receipts.some(receipt => receipt.displayStatus === 'processing')
  useEffect(() => {
    if (!processing) return
    const timer = setInterval(() => { void refresh(limit).catch(() => setError('Updates are delayed. Your receipts are safely saved.')) }, 4000)
    return () => clearInterval(timer)
  }, [processing, refresh, limit])

  const current = receipts.filter((receipt) => receipt.displayStatus !== 'discarded')
  const removed = receipts.filter((receipt) => receipt.displayStatus === 'discarded')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visible = current.filter((receipt) => {
    if (normalizedQuery && !customerReceiptLabel(receipt).toLocaleLowerCase().includes(normalizedQuery)) return false
    if (filter === 'matched') return receipt.displayStatus === 'matched'
    if (filter === 'without_match') return receipt.displayStatus === 'receipt_only'
    if (filter === 'attention') return receipt.displayStatus === 'details_unavailable'
    return true
  })
  return <main className="app-page">
    <PageContainer>
      <BettiPageIntro state="working" eyebrow="Receipts" title="Send me your receipts."
        action={<ReceiptUploadAction variant="history" onComplete={()=>refresh(limit)} />}>
        I’ll read them, keep them with your records, and connect them to the right expenses whenever I can.
      </BettiPageIntro>

      {error && <p role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <section className="mt-8 section-rule sm:mt-11" aria-labelledby="receipt-history-heading">
        <div className="flex flex-wrap items-end justify-between gap-3"><h2 id="receipt-history-heading" className="text-xl font-semibold text-slate-950">Receipt history</h2>
          {!loading && receipts.length > 0 && <p className="text-sm text-slate-600">{summary(receipts)}</p>}</div>
        {!loading&&current.length>0&&<div className="receipt-list-tools mt-4"><label className="sr-only" htmlFor="receipt-search">Search receipts</label><input id="receipt-search" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search receipts" className="min-h-11 min-w-0 rounded-md border border-slate-300 px-3 text-base"/><label className="sr-only" htmlFor="receipt-filter">Filter receipts</label><select id="receipt-filter" value={filter} onChange={event=>setFilter(event.target.value as ReceiptFilter)} className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-base"><option value="all">All receipts</option><option value="matched">Matched</option><option value="without_match">Without a match</option><option value="attention">Needs attention</option></select></div>}
        {loading ? <div role="status" aria-label="Loading receipts" className="mt-4 grid gap-2"><div className="skeleton h-16"/><div className="skeleton h-16"/><div className="skeleton h-16"/></div>
          : current.length === 0 ? <EmptyState title="No receipts yet" description="Upload one and WriteOffs will take it from there." />
          : visible.length===0?<p className="py-10 text-center text-slate-600">No receipts match that search.</p>
          : <div className="receipt-history-list mt-3">{visible.map((receipt) =>
            <ReceiptCard key={receipt.id} receipt={receipt} refresh={()=>refresh(limit)} />)}</div>}
        {!loading&&hasMore&&filter==='all'&&!normalizedQuery&&<button type="button" className="btn btn-secondary mt-5 w-full sm:w-auto" onClick={async()=>{const next=limit+PAGE_SIZE;setLimit(next);setLoading(true);try{await refresh(next)}catch{setError('More receipts could not be loaded. Please try again.');setLoading(false)}}}>Load more receipts</button>}
      </section>
      {removed.length > 0 && <details className="border-t border-slate-200 py-6">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Removed receipts ({removed.length})</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{removed.map((receipt) =>
          <ReceiptCard key={receipt.id} receipt={receipt} refresh={()=>refresh(limit)} />)}</div>
      </details>}
    </PageContainer>
  </main>
}

function ReceiptCard({ receipt, refresh }: { receipt: ReceiptReadItem; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [errors, setErrors] = useState<ReceiptFactErrors>({})
  const [error, setError] = useState<string | null>(null)
  const amount = receipt.totalAmountCents == null ? null : new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
  }).format(receipt.totalAmountCents / 100)
  const multiple = receipt.processingReason === 'MULTIPLE_RECEIPTS_DETECTED'
  const ambiguousImage = ['RECEIPT_TOTAL_AMBIGUOUS','RECEIPT_DATE_AMBIGUOUS'].includes(receipt.processingReason ?? '')
  const delayed = ['PROCESSING_PAUSED','PROCESSING_DELAYED'].includes(receipt.processingReason ?? '')
  const status = multiple ? 'Upload separately' : delayed ? 'Organizing is delayed' : receiptStatus(receipt.displayStatus)
  const mayCorrect = receipt.displayStatus === 'details_unavailable' && !multiple && !ambiguousImage

  async function remove() {
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/bookkeeping/receipts/${receipt.id}/discard`, {
        method: 'POST', headers: { 'idempotency-key': `discard-${receipt.id}` },
      })
      if (!response.ok) throw new Error('REMOVE_FAILED')
      await refresh()
    } catch { setError('This receipt could not be removed. It may need a guarded correction.'); setBusy(false) }
  }

  return <details className="receipt-record group border-b border-slate-200">
    <summary className="receipt-record-summary min-h-14 cursor-pointer list-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#243186]"><span className="min-w-0"><strong className="block truncate font-medium text-slate-950">{customerReceiptLabel(receipt)}</strong><span className="mt-0.5 block text-sm text-slate-600">{formatDate(receipt.occurredOn)??'Date unavailable'} · <span>{status}</span></span></span><span className="text-right"><strong className="block font-medium tabular-nums text-slate-950">{amount??'—'}</strong><span className="receipt-row-chevron mt-1 block text-slate-400" aria-hidden="true">›</span></span></summary>
    <div className="receipt-record-detail pb-3 pl-3 pr-2 text-sm sm:pl-4"><p className="text-slate-600">{multiple ? 'I found more than one receipt in this image. Please upload each receipt separately.' : ambiguousImage ? 'I couldn’t read one clear receipt from this image. If it contains more than one receipt, please upload each separately. Otherwise, try a clearer photo of the whole receipt.' : delayed ? 'Your receipt is safely saved. Organizing is taking longer than usual. Please check back later.' : statusDescription(receipt.displayStatus)}</p>
    <div className="mt-1 flex flex-wrap items-center gap-3">
      <a href={`/api/receipts/${receipt.id}/view`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-semibold text-[#243186] hover:underline">View receipt</a>
      {receipt.processingStatus === 'unreadable' && <button type="button" disabled={busy} className="min-h-11 font-semibold text-[#243186]" onClick={async()=>{setBusy(true);setError(null);try{const response=await fetch(`/api/receipts/${receipt.id}/retry`,{method:'POST'});if(!response.ok)throw new Error('RETRY_FAILED');await refresh()}catch{setError('Please try again later. Your original receipt is safe.')}finally{setBusy(false)}}}>{busy?'Trying again…':'Try processing again'}</button>}
      {mayCorrect && <button type="button" onClick={() => setEditing((value) => !value)} className="min-h-11 text-sm font-semibold text-[#243186]">Edit details</button>}
      {receipt.displayStatus !== 'discarded' && !confirmRemove && <button type="button" onClick={() => setConfirmRemove(true)} className="ml-auto min-h-11 text-xs font-medium text-slate-500">Remove</button>}
    </div>
    {confirmRemove && <div className="surface-subtle mt-3 p-3 text-sm"><p>Remove this receipt from your current records?</p>
      <div className="mt-2 flex gap-3"><button disabled={busy} onClick={() => void remove()} className="min-h-11 font-semibold text-red-700">{busy ? 'Removing…' : 'Yes, remove'}</button>
        <button disabled={busy} onClick={() => setConfirmRemove(false)} className="min-h-11 font-semibold text-slate-700">Cancel</button></div></div>}
    {editing && <CorrectionForm receipt={receipt} onDone={async () => { setEditing(false); await refresh() }} errors={errors} setErrors={setErrors} setError={setError} />}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </div></details>
}

function CorrectionForm({ receipt, onDone, errors, setErrors, setError }: {
  receipt: ReceiptReadItem; onDone: () => Promise<void>; errors: ReceiptFactErrors
  setErrors: (errors: ReceiptFactErrors) => void; setError: (error: string | null) => void
}) {
  const [saving, setSaving] = useState(false)
  const requestKey = useRef(`correction-${crypto.randomUUID()}`)
  return <form className="mt-4 grid gap-4 border-t border-slate-100 pt-4" noValidate onSubmit={async (event) => {
    event.preventDefault(); setError(null)
    const form = new FormData(event.currentTarget)
    const result = validateReceiptFacts({ merchant: String(form.get('merchant') ?? ''),
      occurredOn: String(form.get('date') ?? ''), total: String(form.get('total') ?? '') })
    setErrors(result.errors); if (!result.facts) return
    setSaving(true)
    const response = await fetch(`/api/bookkeeping/receipts/${receipt.id}/correct`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'idempotency-key': requestKey.current },
      body: JSON.stringify(result.facts),
    })
    if (!response.ok) { setError('The receipt details could not be updated.'); setSaving(false); return }
    await onDone()
  }}>
    <label className="text-sm font-medium text-slate-800">Merchant<input name="merchant" defaultValue={receipt.merchant ?? ''} aria-invalid={Boolean(errors.merchant)} className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 text-base" />{errors.merchant && <span className="mt-1 block text-sm text-red-700">{errors.merchant}</span>}</label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-800">Purchase date<input name="date" type="date" defaultValue={receipt.occurredOn ?? ''} aria-invalid={Boolean(errors.occurredOn)} className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 text-base" />{errors.occurredOn && <span className="mt-1 block text-sm text-red-700">{errors.occurredOn}</span>}</label>
      <label className="text-sm font-medium text-slate-800">Total<input name="total" inputMode="decimal" defaultValue={centsToDollars(receipt.totalAmountCents)} aria-invalid={Boolean(errors.total)} className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 text-base" />{errors.total && <span className="mt-1 block text-sm text-red-700">{errors.total}</span>}</label></div>
    <button disabled={saving} className="min-h-12 rounded-md bg-[#243186] px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save details'}</button>
  </form>
}

function receiptStatus(status: ReceiptReadItem['displayStatus']) {
  return { processing: 'Organizing', matched: 'Matched', receipt_only: 'Receipt-only expense',
    details_unavailable: 'Needs attention', discarded: 'Removed' }[status]
}

function summary(receipts: ReceiptReadItem[]) {
  const current = receipts.filter((receipt) => receipt.displayStatus !== 'discarded')
  const organized = current.filter((receipt) => ['matched','receipt_only'].includes(receipt.displayStatus)).length
  const attention = current.filter((receipt) => receipt.processingStatus === 'needs_attention' || receipt.processingStatus === 'unreadable').length
  const processing = current.filter((receipt) => receipt.processingStatus === 'queued' || receipt.processingStatus === 'processing').length
  return [`${organized} organized`,attention ? `${attention} need your help` : null,processing ? `${processing} still processing` : null]
    .filter(Boolean).join(' · ')
}
function statusDescription(status: ReceiptReadItem['displayStatus']) {
  return { processing: 'WriteOffs is organizing this receipt.', matched: 'Matched to transaction.',
    receipt_only: 'Retained without a matching transaction.', details_unavailable: 'Safely retained. Some details are unavailable.',
    discarded: 'No longer used in current records.' }[status]
}
function formatDate(value:string|null){return value?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`)):null}
function customerReceiptLabel(receipt:ReceiptReadItem){
  if(receipt.merchant?.trim())return receipt.merchant.trim()
  if(receipt.occurredOn)return`Receipt from ${formatDate(receipt.occurredOn)}`
  return'Receipt'
}
