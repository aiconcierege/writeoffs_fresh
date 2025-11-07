/* File: app/review/AskWriteOffsDrawer.tsx
 * Version: v2
 * Date: 2025-11-03
 * Notes:
 * - Calls /api/writeoffs/check with { vendor, category } and displays the result.
 * - Lets user insert a concise, citation-backed summary into the Approve modal notes.
 */
'use client'

import { useEffect, useState } from 'react'

type Result = {
  verdict?: 'Yes' | 'No' | 'Depends'
  rationale?: string
  citations?: { title: string; section: string; url: string }[]
  error?: string
}

export default function AskWriteOffsDrawer({
  open,
  onClose,
  txVendor,
  txCategory,
  onInsertNotes
}: {
  open: boolean
  onClose: () => void
  txVendor: string
  txCategory: string | null
  onInsertNotes?: (text: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<Result | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setRes(null)
    ;(async () => {
      try {
        const r = await fetch('/api/writeoffs/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendor: txVendor || '',
            category: txCategory || ''
          })
        })
        const data: Result = await r.json()
        setRes(data)
      } catch (e: any) {
        setRes({ error: e?.message || 'Could not check deductibility' })
      } finally {
        setLoading(false)
      }
    })()
  }, [open, txVendor, txCategory])

  function insert() {
    if (!res) return
    const parts = []
    if (res.verdict) parts.push(`Verdict: ${res.verdict}`)
    if (res.rationale) parts.push(res.rationale)
    if (res.citations?.length) {
      const cites = res.citations.map(c => `${c.title} — ${c.section}`).join('; ')
      parts.push(`Sources: ${cites}`)
    }
    const text = parts.join(' — ')
    onInsertNotes?.(text)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/30"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-md bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-base font-semibold">Ask WriteOffs?</div>
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="px-4 py-3 text-sm">
          {loading && <div>Checking…</div>}
          {!loading && res?.error && (
            <div className="text-red-700">Error: {res.error}</div>
          )}

          {!loading && !res?.error && res && (
            <>
              <div className="mb-2">
                <span className="text-neutral-600">Verdict:</span>{' '}
                <span className="font-semibold">{res.verdict}</span>
              </div>
              {res.rationale && <p className="mb-3">{res.rationale}</p>}
              {res.citations && res.citations.length > 0 && (
                <div className="mb-3">
                  <div className="text-sm font-medium">Citations</div>
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {res.citations.map((c, i) => (
                      <li key={i}>
                        <a href={c.url} className="underline" target="_blank" rel="noreferrer">
                          {c.title}
                        </a>{' '}
                        — {c.section}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={insert}
                  className="rounded-xl border px-3 py-1.5 text-xs"
                >
                  Insert to notes
                </button>
                <button
                  onClick={onClose}
                  className="rounded-xl border px-3 py-1.5 text-xs"
                >
                  Close
                </button>
              </div>

              <p className="mt-3 text-[11px] text-neutral-600">
                Educational information only — not tax advice. Rules depend on facts. Confirm with your CPA if unsure.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

