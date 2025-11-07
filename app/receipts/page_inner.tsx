'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../utils/supabase/client'
import Link from 'next/link'

type UploadItem = {
  file: File
  checked: boolean
  status: 'ready' | 'uploading' | 'saving' | 'done' | 'error'
  message?: string
  storagePath?: string
  signedUrl?: string
}

type ExistingReceipt = {
  id: string
  storage_path: string
  original_name?: string | null
  mime_type: string
  bytes: number
  created_at: string
  transaction_id: string | null
  signed_url: string | null
  vendor_hint?: string | null
  date_hint?: string | null
  total_hint?: number | null
  ocr_provider?: string | null
  ocr_status?: string | null
  ocr_confidence?: number | null
}

export default function ReceiptsInner() {
  const [userId, setUserId] = useState<string | null>(null)

  // Upload queue
  const [items, setItems] = useState<UploadItem[]>([])
  const [busy, setBusy] = useState(false)
  const [selectAll, setSelectAll] = useState(false)

  // Existing uploads
  const [existing, setExisting] = useState<ExistingReceipt[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [listErr, setListErr] = useState<string | null>(null)

  // Diagnostics
  const [annotatingId, setAnnotatingId] = useState<string | null>(null)
  const [ocrRunningId, setOcrRunningId] = useState<string | null>(null)

  // By default hide linked receipts; toggle for debugging
  const [showLinkedToo, setShowLinkedToo] = useState(false)

  // Undo toast state
  const [toastOpen, setToastOpen] = useState(false)
  const [toastTxId, setToastTxId] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string>('Transaction created from OCR')
  const toastTimerRef = useRef<number | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (ignore) return
        if (!user) { window.location.href = '/login'; return }
        setUserId(user.id)
        await refreshExisting()
      } catch { /* no-op */ }
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user) window.location.href = '/login'
    })
    return () => { ignore = true; sub.subscription.unsubscribe() }
  }, [showLinkedToo])

  async function refreshExisting() {
    setListBusy(true); setListErr(null)
    try {
      const qs = new URLSearchParams({ limit: '50' })
      if (showLinkedToo) qs.set('all', '1') // show linked and unlinked when toggled
      const res = await fetch(`/api/receipts?${qs.toString()}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load receipts')
      setExisting(Array.isArray(data?.receipts) ? data.receipts as ExistingReceipt[] : [])
    } catch (e: any) {
      setListErr(e?.message || 'Failed to load receipts')
    } finally {
      setListBusy(false)
    }
  }

  function safeTestFileType(type: string): boolean {
    return /^(?:image\/.+|application\/pdf)$/.test(type || '')
  }

  function onFilesSelected(files: FileList | null) {
    try {
      if (!files) return
      const incoming: UploadItem[] = []
      for (const f of Array.from(files)) {
        if (!safeTestFileType(f.type)) {
          incoming.push({ file: f, checked: false, status: 'error', message: 'Only images or PDFs' })
        } else {
          incoming.push({ file: f, checked: true, status: 'ready' })
        }
      }
      setItems(prev => [...incoming, ...prev])
      setSelectAll(true)
    } catch {}
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    onFilesSelected(e.dataTransfer.files)
  }

  function setCheckedAll(next: boolean) {
    setSelectAll(next)
    setItems(prev => prev.map(i => ({ ...i, checked: i.status === 'ready' ? next : i.checked })))
  }

  function toggleOne(idx: number, next: boolean) {
    setItems(prev => {
      const copy = prev.slice()
      copy[idx] = { ...copy[idx], checked: next }
      return copy
    })
  }

  const readyCheckedCount = items.filter(i => i.checked && i.status === 'ready').length

  function uuidv4() {
    try { if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') return (crypto as any).randomUUID() } catch {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  async function annotateById(id: string) {
    setAnnotatingId(id)
    try {
      await fetch('/api/receipts/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
    } catch {}
    setAnnotatingId(null)
  }

  async function handleUploadSelected() {
    if (!userId) return
    const queue = items.slice()
    setBusy(true)

    for (let i = 0; i < queue.length; i++) {
      try {
        const it = queue[i]
        if (!it.checked || it.status !== 'ready') continue

        // 1) Upload to Storage
        queue[i] = { ...it, status: 'uploading', message: 'Uploading…' }
        setItems([...queue])

        const ext = extFromName(it.file.name) || extFromType(it.file.type) || 'bin'
        const path = `receipts/${userId}/${uuidv4()}.${ext}`

        const { error: upErr } = await supabase.storage
          .from('receipts')
          .upload(path, it.file, {
            contentType: it.file.type || 'application/octet-stream',
            upsert: false
          })

        if (upErr) {
          queue[i] = { ...it, status: 'error', message: upErr.message }
          setItems([...queue])
          continue
        }

        // 2) Save metadata row (store original_name) and RETURN the id
        queue[i] = { ...it, status: 'saving', message: 'Saving metadata…', storagePath: path }
        setItems([...queue])

        const { data: inserted, error: dbErr } = await supabase
          .from('receipts')
          .insert({
            user_id: userId,
            transaction_id: null,
            storage_path: path,
            original_name: it.file.name,
            mime_type: it.file.type || 'application/octet-stream',
            bytes: it.file.size
          })
          .select('id')
          .single()

        if (dbErr || !inserted?.id) {
          queue[i] = { ...it, status: 'error', message: dbErr?.message || 'Insert failed' }
          setItems([...queue])
          continue
        }

        // 3) Optional short preview link
        const { data: signed } = await supabase
          .storage
          .from('receipts')
          .createSignedUrl(path, 60)

        queue[i] = {
          ...it,
          status: 'done',
          message: 'Uploaded',
          storagePath: path,
          signedUrl: signed?.signedUrl || undefined
        }
        setItems([...queue])

        // 4) Auto-annotate from filename
        await annotateById(inserted.id)
      } catch (e: any) {
        queue[i] = { ...queue[i], status: 'error', message: e?.message || 'Upload failed' }
        setItems([...queue])
      }
    }

    setBusy(false)
    await refreshExisting()
  }

  async function deleteReceipt(id: string) {
    const ok = window.confirm('Delete this receipt and its file? This cannot be undone.')
    if (!ok) return
    const prev = existing
    setExisting(prev.filter(r => r.id !== id))
    try {
      const res = await fetch('/api/receipts/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to delete receipt')
      }
    } catch (e) {
      setExisting(prev)
      alert((e as Error).message || 'Failed to delete receipt')
    }
  }

  async function runOCR(id: string) {
    setOcrRunningId(id)
    try {
      const res = await fetch('/api/receipts/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.ok === false) {
        const msg = data?.error || 'OCR failed'
        alert(msg)
      } else {
        const txId = typeof data?.transaction_id === 'string' ? data.transaction_id : null
        if (txId) {
          setToastTxId(txId)
          setToastMsg(data?.needs_review ? 'Transaction created (needs review)' : 'Transaction created')
          setToastOpen(true)
          if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
          toastTimerRef.current = window.setTimeout(() => setToastOpen(false), 8000)
        }
      }
      await refreshExisting()
    } catch (e: any) {
      alert(e?.message || 'OCR failed')
    } finally {
      setOcrRunningId(null)
    }
  }

  async function undoOCR() {
    if (!toastTxId) return
    try {
      const res = await fetch('/api/tx/undo-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tx_id: toastTxId })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.ok === false) {
        alert(data?.error || 'Undo failed')
        return
      }
      setToastOpen(false)
      setToastTxId(null)
      await refreshExisting()
    } catch (e: any) {
      alert(e?.message || 'Undo failed')
    }
  }

  return (
    <main className="min-h-screen bg-muted">
      <section className="mx-auto max-w-7xl px-6 pt-8">
        <div className="mb-2 inline-block w-12 border-b-4" style={{ borderColor: 'var(--mint-500)' }} />
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Receipts</h1>
          <Link href="/review" className="btn btn-secondary">Back to Review</Link>
        </div>
        <p className="mt-2 text-sm text-muted">
          Upload images/PDFs, run OCR, and link receipts to transactions.
        </p>
      </section>

      {/* Uploader card */}
      <section className="mx-auto mt-6 max-w-7xl px-6">
        <div className="card p-5">
          <div
            className="rounded-2xl border-2 border-dashed p-8 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            <div className="text-sm text-neutral-700">
              Drag & drop images/PDFs here, or
            </div>
            <div className="mt-2">
              <button
                onClick={() => inputRef.current?.click()}
                className="btn btn-secondary"
                disabled={!userId}
              >
                Choose files
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => onFilesSelected(e.target.files)}
            />
          </div>

          {/* Upload actions */}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleUploadSelected}
              disabled={busy || !userId || items.every(i => i.status !== 'ready' || !i.checked)}
              className="btn btn-primary disabled:opacity-60"
            >
              {busy ? 'Uploading…' : 'Upload selected'}
            </button>
            <button
              onClick={() => setItems([])}
              disabled={busy || items.length === 0}
              className="btn btn-secondary disabled:opacity-60"
            >
              Clear list
            </button>
            <button
              onClick={refreshExisting}
              disabled={listBusy}
              className="ml-auto btn btn-secondary"
            >
              {listBusy ? 'Refreshing…' : 'Refresh uploads'}
            </button>
            <label className="ml-2 inline-flex items-center gap-2 text-xs text-neutral-700">
              <input
                type="checkbox"
                checked={showLinkedToo}
                onChange={(e) => setShowLinkedToo(e.target.checked)}
              />
              Show linked too
            </label>
          </div>
        </div>
      </section>

      {/* My uploads card */}
      <section className="mx-auto mt-6 max-w-7xl px-6">
        <div className="card p-0">
          <div className="flex items-center justify-between border-b border-surface px-4 py-3">
            <div className="text-base font-semibold">My uploads</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <Th>File</Th>
                  <Th>Hints</Th>
                  <Th>OCR</Th>
                  <Th>Linked Tx</Th>
                  <Th>Type</Th>
                  <Th className="text-right">Size</Th>
                  <Th>Created</Th>
                  <Th className="w-[220px]">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {listErr && (
                  <tr><Td colSpan={8}><div className="py-6 text-red-700">{listErr}</div></Td></tr>
                )}
                {!listErr && existing.length === 0 && (
                  <tr><Td colSpan={8}><div className="py-10 text-center text-neutral-600">No uploads found. Use the uploader above, then refresh.</div></Td></tr>
                )}
                {!listErr && existing.map((r) => (
                  <tr key={r.id} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100 transition-colors">
                    <Td className="max-w-[40ch] truncate" title={r.original_name || r.storage_path}>
                      <div className="font-mono">{r.original_name || basename(r.storage_path)}</div>
                      {r.signed_url && (<a className="text-xs underline" href={r.signed_url} target="_blank" rel="noreferrer">Preview (60s)</a>)}
                    </Td>

                    <Td className="align-top">
                      {r.vendor_hint || r.date_hint || typeof r.total_hint === 'number'
                        ? (
                          <div className="space-y-0.5 text-xs">
                            {r.vendor_hint && <div><span className="text-neutral-500">Vendor:</span> {r.vendor_hint}</div>}
                            {r.date_hint && <div><span className="text-neutral-500">Date:</span> {r.date_hint}</div>}
                            {typeof r.total_hint === 'number' && <div><span className="text-neutral-500">Total:</span> ${r.total_hint.toFixed(2)}</div>}
                          </div>
                        )
                        : (<span className="text-xs text-neutral-500">No hints yet</span>)
                      }
                    </Td>

                    <Td className="align-top text-xs">
                      {r.ocr_status
                        ? (
                          <div className="space-y-0.5">
                            <div>Status: <span className="font-medium">{r.ocr_status}</span></div>
                            {r.ocr_provider && <div>Provider: {r.ocr_provider}</div>}
                            {typeof r.ocr_confidence === 'number' && <div>Conf: {r.ocr_confidence.toFixed(0)}%</div>}
                          </div>
                        )
                        : (<span className="text-neutral-500">—</span>)
                      }
                    </Td>

                    <Td>{r.transaction_id ? (<span className="font-mono">{r.transaction_id}</span>) : (<span className="text-neutral-500">—</span>)}</Td>
                    <Td>{r.mime_type}</Td>
                    <Td className="text-right">{formatBytes(r.bytes)}</Td>
                    <Td>{new Date(r.created_at).toLocaleString()}</Td>

                    <Td>
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => runOCR(r.id)} disabled={ocrRunningId === r.id} className="btn btn-secondary" aria-label="Run OCR">
                          {ocrRunningId === r.id ? 'Running…' : 'Run OCR'}
                        </button>
                        <button onClick={() => deleteReceipt(r.id)} className="btn btn-secondary" aria-label="Delete receipt">
                          Delete
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Undo toast */}
      {toastOpen && (
        <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-6">
          <div className="mx-auto max-w-md card px-4 py-3 shadow-md">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-neutral-800">{toastMsg}</div>
              <div className="flex items-center gap-2">
                <button onClick={undoOCR} className="btn btn-secondary">Undo</button>
                <button onClick={() => setToastOpen(false)} className="btn btn-secondary">Dismiss</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function Th({ children, className = '' }: any) { return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th> }
function Td({ children, className = '', colSpan }: any) { return <td className={`px-3 py-2 align-top ${className}`} colSpan={colSpan}>{children}</td> }
function extFromName(name: string): string | null { const m = name.match(/\.([a-zA-Z0-9]+)$/); return m ? m[1].toLowerCase() : null }
function extFromType(type: string): string | null { if (!type) return null; if (type === 'application/pdf') return 'pdf'; if (type.startsWith('image/')) return type.split('/')[1]; return null }
function formatBytes(n: number) { if (n < 1024) return `${n} B`; if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`; return `${(n / (1024 * 1024)).toFixed(1)} MB` }
function basename(p: string) { const parts = p.split('/'); return parts[parts.length - 1] || p }
