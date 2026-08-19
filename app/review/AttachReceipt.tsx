/* File: app/review/AttachReceipt.tsx
 * Version: v2
 * Date: 2025-10-14
 * Notes:
 * - Accepts transaction context (date, amount, vendor) and ranks receipts:
 *     +2 pts if |amount - total_hint| ≤ $2
 *     +1 pt  if |date - date_hint| ≤ 7 days
 *     +0.5   if vendor words overlap (very soft signal)
 * - Sorts receipts by score desc and marks the top one "Likely match".
 * - Still attaches via POST /api/receipts.
 */
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Receipt = {
  id: string
  originalName: string
  mimeType: string
  bytes: number
  createdAt: string
  signedUrl: string | null
  merchant?: string | null
  occurredOn?: string | null
  totalAmountCents?: number | null
  state: string
}

export default function AttachReceipt({
  transactionId,
  txDate,     // 'YYYY-MM-DD'
  txAmount,   // number (negative = expense)
  txVendor,   // string | null
  onAttached
  ,canonical = false
}: {
  transactionId: string
  txDate?: string | null
  txAmount?: number | null
  txVendor?: string | null
  onAttached?: () => void
  canonical?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [emptyMsg, setEmptyMsg] = useState<string>('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setReceipts([])
    setEmptyMsg('')
    ;(async () => {
      try {
        const res = await fetch('/api/receipts?limit=50', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Failed to load receipts')
        const items: Receipt[] = Array.isArray(data?.receipts)
          ? data.receipts.filter((receipt: Receipt) => !['matched', 'kept', 'discarded'].includes(receipt.state)) : []
        setReceipts(items)
        if (items.length === 0) {
          setEmptyMsg('No receipts found. Upload on the Receipts page, then try again.')
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load receipts')
      } finally {
        setLoading(false)
      }
    })()
  }, [open])

  // --- Scoring helpers ---
  const txDateObj = useMemo(() => (txDate ? new Date(txDate + 'T00:00:00') : null), [txDate])
  const txAbs = Math.abs(Number(txAmount ?? 0))
  const vendorWords = useMemo(() => tokenize(txVendor), [txVendor])

  const score = useCallback((r: Receipt) => {
    let s = 0
    // Amount proximity (use absolute)
    const rh = typeof r.totalAmountCents === 'number' ? Math.abs(r.totalAmountCents / 100) : null
    if (rh != null && !Number.isNaN(rh) && txAbs > 0) {
      if (Math.abs(txAbs - rh) <= 2) s += 2
      else if (Math.abs(txAbs - rh) <= 5) s += 1
    }

    // Date proximity (±7 days)
    if (txDateObj && r.occurredOn) {
      const rd = new Date(r.occurredOn + 'T00:00:00')
      const diffDays = Math.abs((rd.getTime() - txDateObj.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays <= 7) s += 1
    }

    // Vendor overlap (very soft)
    if (r.merchant && vendorWords.size > 0) {
      const overlap = intersect(vendorWords, tokenize(r.merchant))
      if (overlap.size > 0) s += 0.5
    }

    return s
  }, [txAbs, txDateObj, vendorWords])

  const ranked = useMemo(() => {
    const withScore = receipts.map(r => ({ r, s: score(r) }))
    withScore.sort((a, b) => b.s - a.s || new Date(b.r.createdAt).getTime() - new Date(a.r.createdAt).getTime())
    return withScore
  }, [receipts, score])

  const topId = ranked.length > 0 ? ranked[0].r.id : null

  async function attach(id: string) {
    setLinkingId(id)
    setError(null)
    try {
      const res = await fetch(canonical
        ? `/api/bookkeeping/financial-transactions/${transactionId}/receipts`
        : '/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(canonical
          ? { receipt_id: id }
          : { receipt_id: id, transaction_id: transactionId })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to attach receipt')

      // Optimistically close + notify parent
      setOpen(false)
      setLinkingId(null)
      onAttached?.()
    } catch (e: any) {
      setError(e?.message || 'Failed to attach receipt')
      setLinkingId(null)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border px-2 py-1 text-xs"
        aria-label="Attach a receipt to this transaction"
      >
        Attach
      </button>

      {!open ? null : (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Attach receipt"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-xl overflow-hidden rounded-2xl border bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="text-base font-semibold">Attach a receipt</div>
              <button
                className="rounded-lg border px-2 py-1 text-xs"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                Close
              </button>
            </div>

            <div className="max-h-[62vh] overflow-y-auto px-4 py-3">
              {/* txn context */}
              {(txDate || txAmount || txVendor) && (
                <div className="mb-3 rounded-xl border bg-neutral-50 p-3 text-xs text-neutral-700">
                  <div><span className="font-semibold">Transaction:</span> {txVendor || '—'}</div>
                  <div>Date: {txDate || '—'} · Amount: {formatAmount(txAmount ?? 0)}</div>
                </div>
              )}

              {loading && <div className="text-sm text-neutral-600">Loading…</div>}
              {error && <div className="text-sm text-red-700">Error: {error}</div>}
              {!loading && !error && ranked.length === 0 && (
                <div className="text-sm text-neutral-600">{emptyMsg || 'No receipts available.'}</div>
              )}

              <ul className="space-y-2">
                {ranked.map(({ r, s }) => (
                  <li key={r.id} className="flex items-center justify-between rounded-xl border px-3 py-2">
                    <div className="min-w-0 pr-3">
                      <div className="truncate text-sm font-medium">{r.originalName}</div>
                      <div className="text-xs text-neutral-600">
                        {r.merchant ? `Merchant: ${r.merchant} · ` : ''}
                        {r.occurredOn ? `Date: ${r.occurredOn} · ` : ''}
                        {typeof r.totalAmountCents === 'number' ? `Total: ${formatAmount(r.totalAmountCents / 100)}` : ''}
                      </div>
                      {r.signedUrl && (
                        <a
                          href={r.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs underline"
                        >
                          Preview (60s)
                        </a>
                      )}
                      {s > 0 && (
                        <span className="ml-2 rounded-full border px-2 py-[2px] text-[10px] text-neutral-700">
                          {r.id === topId ? 'Likely match' : 'Similar'}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => attach(r.id)}
                      disabled={!!linkingId && linkingId !== r.id}
                      className={`rounded-xl ${r.id === topId ? 'btn-primary text-white' : 'btn-secondary'} px-3 py-1.5 text-xs font-semibold disabled:opacity-60`}
                      title={r.id === topId ? 'Attach (Likely match)' : 'Attach'}
                    >
                      {linkingId === r.id ? 'Attaching…' : (r.id === topId ? 'Attach (Likely)' : 'Attach')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t px-4 py-3 text-right text-xs">
              <a href="/receipts" className="underline">Open Receipts</a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ---------- helpers ---------- */
function tokenize(s?: string | null) {
  const set = new Set<string>()
  if (!s) return set
  for (const w of s.toLowerCase().split(/[^\w]+/)) {
    if (!w) continue
    if (w.length <= 2) continue
    set.add(w)
  }
  return set
}
function intersect(a: Set<string>, b: Set<string>) {
  const out = new Set<string>()
  for (const x of a) if (b.has(x)) out.add(x)
  return out
}
function formatAmount(n: number) {
  const v = Number(n)
  if (Number.isNaN(v)) return String(n)
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}
