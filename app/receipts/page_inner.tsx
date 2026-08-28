'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReceiptReadItem } from '../lib/bookkeeping/receipt-workflow'
import { ReceiptUploadAction } from './ReceiptUploadAction'
import { centsToDollars, validateReceiptFacts, type ReceiptFactErrors } from './receipt-form'
import { BettiPageIntro, EmptyState, PageContainer, StatusBadge } from '../components/ui'

export default function ReceiptsInner() {
  const [receipts, setReceipts] = useState<ReceiptReadItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const response = await fetch('/api/receipts?limit=500', { cache: 'no-store' })
    if (response.status === 401) { window.location.href = '/login'; return }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error('LOAD_FAILED')
    setReceipts(data.receipts ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void refresh().catch(() => { setError('Receipts could not be loaded. Try refreshing.'); setLoading(false) }) }, [refresh])

  const current = receipts.filter((receipt) => receipt.displayStatus !== 'discarded')
  const removed = receipts.filter((receipt) => receipt.displayStatus === 'discarded')
  return <main className="app-page">
    <PageContainer>
      <BettiPageIntro state="working" eyebrow="Receipts" title="Send me your receipts."
        action={<ReceiptUploadAction variant="history" onComplete={refresh} />}>
        I’ll read them, keep them with your records, and connect them to the right expenses whenever I can.
      </BettiPageIntro>

      {error && <p role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <section className="mt-11 section-rule" aria-labelledby="receipt-history-heading">
        <div className="flex flex-wrap items-end justify-between gap-3"><h2 id="receipt-history-heading" className="text-xl font-semibold text-slate-950">Receipt history</h2>
          {!loading && receipts.length > 0 && <p className="text-sm text-slate-600">{summary(receipts)}</p>}</div>
        {loading ? <div role="status" aria-label="Loading receipts" className="mt-5 grid gap-4 sm:grid-cols-2"><div className="skeleton h-36"/><div className="skeleton hidden h-36 sm:block"/></div>
          : current.length === 0 ? <EmptyState title="No receipts yet" description="Upload one and WriteOffs will take it from there." />
          : <div className="receipt-history-list mt-5 grid gap-4">{current.map((receipt) =>
            <ReceiptCard key={receipt.id} receipt={receipt} refresh={refresh} />)}</div>}
      </section>
      {removed.length > 0 && <details className="border-t border-slate-200 py-6">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Removed receipts ({removed.length})</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{removed.map((receipt) =>
          <ReceiptCard key={receipt.id} receipt={receipt} refresh={refresh} />)}</div>
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
  const status = receiptStatus(receipt.displayStatus)
  const mayCorrect = receipt.displayStatus === 'details_unavailable'

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

  return <article className="receipt-record surface p-5 sm:p-6">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0"><h3 className="truncate font-medium text-slate-950">{receipt.merchant ?? receipt.originalName}</h3>
        <p className="mt-1 text-sm text-slate-600">{[receipt.occurredOn, amount].filter(Boolean).join(' · ') || 'Details unavailable'}</p></div>
      <StatusBadge tone={receipt.displayStatus === 'matched' ? 'positive' : receipt.displayStatus === 'processing' ? 'muted' : receipt.displayStatus === 'details_unavailable' ? 'attention' : 'neutral'}>{status}</StatusBadge>
    </div>
    <p className="mt-3 text-base leading-6 text-slate-600">{statusDescription(receipt.displayStatus)}</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {receipt.signedUrl && <a href={receipt.signedUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#243186] hover:underline">View receipt</a>}
      {mayCorrect && <button type="button" onClick={() => setEditing((value) => !value)} className="min-h-11 text-sm font-semibold text-[#243186]">Edit details</button>}
      {receipt.displayStatus !== 'discarded' && !confirmRemove && <button type="button" onClick={() => setConfirmRemove(true)} className="min-h-11 text-sm font-semibold text-slate-600">Remove</button>}
    </div>
    {confirmRemove && <div className="surface-subtle mt-3 p-3 text-sm"><p>Remove this receipt from your current records?</p>
      <div className="mt-2 flex gap-3"><button disabled={busy} onClick={() => void remove()} className="min-h-11 font-semibold text-red-700">{busy ? 'Removing…' : 'Yes, remove'}</button>
        <button disabled={busy} onClick={() => setConfirmRemove(false)} className="min-h-11 font-semibold text-slate-700">Cancel</button></div></div>}
    {editing && <CorrectionForm receipt={receipt} onDone={async () => { setEditing(false); await refresh() }} errors={errors} setErrors={setErrors} setError={setError} />}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </article>
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
  return { processing: 'Still organizing', matched: 'Matched', receipt_only: 'Receipt only',
    details_unavailable: 'Receipt added', discarded: 'Removed' }[status]
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
