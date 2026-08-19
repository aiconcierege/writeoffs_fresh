'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../utils/supabase/client'
import type { ReceiptReadItem } from '../lib/bookkeeping/receipt-workflow'

type UploadItem = { file: File; state: 'ready' | 'working' | 'done' | 'error'; message?: string }

export default function ReceiptsInner() {
  const input = useRef<HTMLInputElement>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [receipts, setReceipts] = useState<ReceiptReadItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const response = await fetch('/api/receipts?limit=100', { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error ?? 'Unable to load receipts.')
    setReceipts(data.receipts ?? [])
  }, [])

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      setUserId(user.id)
      try { await refresh() } catch (cause) { setError(message(cause)) }
    })()
  }, [refresh])

  function select(files: FileList | null) {
    if (!files) return
    setUploads((current) => [...Array.from(files).map((file): UploadItem => ({
      file, state: /^(image\/.+|application\/pdf)$/.test(file.type) ? 'ready' : 'error',
      message: /^(image\/.+|application\/pdf)$/.test(file.type) ? undefined : 'Choose an image or PDF.',
    })), ...current])
  }

  async function upload() {
    if (!userId) return
    setBusy(true); setError(null)
    const next = [...uploads]
    for (let index = 0; index < next.length; index += 1) {
      if (next[index].state !== 'ready') continue
      const item = next[index]
      try {
        next[index] = { ...item, state: 'working', message: 'Uploading…' }; setUploads([...next])
        const fingerprint = await sha256(item.file)
        const id = crypto.randomUUID()
        const storagePath = `receipts/${userId}/${fingerprint}`
        const result = await supabase.storage.from('receipts').upload(storagePath, item.file, {
          contentType: item.file.type || 'application/octet-stream', upsert: false,
        })
        if (result.error && !/already exists|duplicate/i.test(result.error.message)) throw result.error
        const saved = await fetch('/api/receipts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, uploadFingerprint: fingerprint, storagePath,
            originalName: item.file.name, mimeType: item.file.type || 'application/octet-stream', bytes: item.file.size }) })
        const savedData = await saved.json().catch(() => ({}))
        if (!saved.ok) throw new Error(savedData.error ?? 'Unable to register receipt.')
        const receiptId = savedData.receipt.id as string
        await fetch('/api/receipts/annotate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: receiptId }) })
        next[index] = { ...item, state: 'done', message: 'Receipt saved' }; setUploads([...next])
      } catch (cause) {
        next[index] = { ...item, state: 'error', message: message(cause) }; setUploads([...next])
      }
    }
    setBusy(false); await refresh()
  }

  async function action(id: string, kind: 'keep' | 'discard' | 'ocr') {
    setBusy(true); setError(null)
    try {
      const endpoint = kind === 'ocr' ? '/api/receipts/ocr' : `/api/bookkeeping/receipts/${id}/${kind}`
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: kind === 'ocr' ? JSON.stringify({ id }) : undefined })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.ok === false) throw new Error(data.error ?? 'Unable to update receipt.')
      await refresh()
    } catch (cause) { setError(message(cause)) } finally { setBusy(false) }
  }

  const active = receipts.filter((receipt) => ['uploaded', 'extraction_completed', 'unmatched'].includes(receipt.state))
  const handled = receipts.filter((receipt) => ['matched', 'kept', 'legacy'].includes(receipt.state))
  return <main className="min-h-screen bg-[#fbfbfa]">
    <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-3xl font-semibold tracking-[-0.025em] text-slate-950">Receipts</h1>
          <p className="mt-2 text-sm text-slate-600">Keep purchase documents organized with your business activity.</p></div>
        <Link href="/transactions" className="text-sm font-semibold text-[#243186] hover:underline">Back to Transactions</Link>
      </div>

      <section className="border-b border-slate-200 py-8" aria-labelledby="upload-heading">
        <h2 id="upload-heading" className="text-lg font-semibold text-slate-950">Add receipts</h2>
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-5 py-7 text-center"
          onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); select(event.dataTransfer.files) }}>
          <p className="text-sm text-slate-600">Drop images or PDFs here, or choose files from your device.</p>
          <button type="button" disabled={!userId} onClick={() => input.current?.click()}
            className="mt-4 min-h-11 rounded-md bg-[#243186] px-5 text-sm font-semibold text-white">Choose files</button>
          <input ref={input} type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={(event) => select(event.target.files)} />
        </div>
        {uploads.length > 0 && <div className="mt-4 space-y-2">{uploads.map((item, index) => <div key={`${item.file.name}:${index}`} className="flex justify-between gap-4 text-sm">
          <span className="truncate text-slate-800">{item.file.name}</span><span className="text-slate-500">{item.message ?? 'Ready'}</span></div>)}
          <button type="button" disabled={busy || !uploads.some((item) => item.state === 'ready')} onClick={upload}
            className="mt-3 min-h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-50">Upload selected</button></div>}
      </section>

      {error && <p role="alert" className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <section className="py-8" aria-labelledby="attention-heading"><h2 id="attention-heading" className="text-lg font-semibold text-slate-950">Needs attention</h2>
        {active.length === 0 ? <p className="mt-3 text-sm text-slate-600">No receipts need your help.</p>
          : <div className="mt-3 divide-y divide-slate-200">{active.map((receipt) => <ReceiptRow key={receipt.id} receipt={receipt} busy={busy} action={action} attention />)}</div>}
      </section>
      {handled.length > 0 && <section className="border-t border-slate-200 py-8" aria-labelledby="handled-heading"><h2 id="handled-heading" className="text-lg font-semibold text-slate-950">Organized receipts</h2>
        <div className="mt-3 divide-y divide-slate-200">{handled.map((receipt) => <ReceiptRow key={receipt.id} receipt={receipt} busy={busy} action={action} />)}</div></section>}
    </section>
  </main>
}

function ReceiptRow({ receipt, busy, action, attention = false }: { receipt: ReceiptReadItem; busy: boolean;
  action: (id: string, kind: 'keep' | 'discard' | 'ocr') => Promise<void>; attention?: boolean }) {
  const [showFacts, setShowFacts] = useState(false)
  const [factError, setFactError] = useState<string | null>(null)
  const amount = receipt.totalAmountCents == null ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(receipt.totalAmountCents / 100)
  const canKeep = receipt.totalAmountCents != null && receipt.occurredOn != null
  return <article className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
    <div className="min-w-0"><div className="flex items-center gap-3"><p className="truncate font-medium text-slate-950">{receipt.merchant ?? receipt.originalName}</p>
      <span className="text-xs text-slate-500">{receipt.state === 'kept' ? 'Receipt only' : receipt.state === 'matched' ? 'Matched' : receipt.state === 'legacy' ? 'Historical receipt' : 'Unmatched'}</span></div>
      <p className="mt-1 text-sm text-slate-600">{[receipt.occurredOn, amount].filter(Boolean).join(' · ') || 'Waiting for receipt details'}</p>
      {receipt.signedUrl && <a href={receipt.signedUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-medium text-[#243186] hover:underline">View receipt</a>}
    </div>
    {attention && <div className="flex flex-wrap gap-2">
      {!canKeep && <button disabled={busy} onClick={() => action(receipt.id, 'ocr')} className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold">Read receipt</button>}
      <button disabled={busy} onClick={() => canKeep ? action(receipt.id, 'keep') : setShowFacts(true)}
        className="min-h-10 rounded-md bg-[#243186] px-3 text-sm font-semibold text-white disabled:opacity-40">Keep receipt</button>
      <button disabled={busy} onClick={() => action(receipt.id, 'discard')} className="min-h-10 px-3 text-sm font-semibold text-slate-600 hover:underline">Discard receipt</button>
    </div>}
    {attention && showFacts && !canKeep && <form className="sm:col-span-2 grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-3" onSubmit={async (event) => {
      event.preventDefault(); setFactError(null)
      const form = new FormData(event.currentTarget)
      const dollars = Number(form.get('total'))
      try {
        const response = await fetch(`/api/bookkeeping/receipts/${receipt.id}/keep-with-facts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            merchant: form.get('merchant'), occurredOn: form.get('date'), totalAmountCents: Math.round(dollars * 100),
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error ?? 'Unable to keep receipt.')
        window.location.reload()
      } catch (cause) { setFactError(message(cause)) }
    }}>
      <label className="text-xs font-medium text-slate-700">Merchant<input name="merchant" required maxLength={500} defaultValue={receipt.merchant ?? ''} className="mt-1 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" /></label>
      <label className="text-xs font-medium text-slate-700">Purchase date<input name="date" required type="date" defaultValue={receipt.occurredOn ?? ''} className="mt-1 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" /></label>
      <label className="text-xs font-medium text-slate-700">Receipt total<input name="total" required type="number" min="0.01" step="0.01" className="mt-1 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" /></label>
      <div className="sm:col-span-3 flex items-center gap-3"><button className="min-h-10 rounded-md bg-[#243186] px-4 text-sm font-semibold text-white">Save and keep</button>
        <button type="button" onClick={() => setShowFacts(false)} className="text-sm text-slate-600">Cancel</button>{factError && <span role="alert" className="text-sm text-red-700">{factError}</span>}</div>
    </form>}
  </article>
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('')
}
function message(cause: unknown) { return cause instanceof Error ? cause.message : 'Something went wrong.' }
