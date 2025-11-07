/* File: app/review/ApproveNotesModal.tsx
 * Version: v4
 * Date: 2025-11-03
 * Notes:
 * - Adds “Ask WriteOffs?” drawer (education-only, with citations).
 * - Inserts summary + sources into notes on click.
 * - Approve posts to /api/tx/approve and calls onApproved optimistically.
 */
'use client'

import { useEffect, useState } from 'react'
import AskWriteOffsDrawer from './AskWriteOffsDrawer'

export default function ApproveNotesModal({
  open,
  onClose,
  txId,
  txVendor,
  txCategory,
  currentNotes,
  onApproved
}: {
  open: boolean
  onClose: () => void
  txId: string
  txVendor: string
  txCategory: string | null
  currentNotes?: string | null
  onApproved?: (notes: string | null) => void
}) {
  const [notes, setNotes] = useState<string>(currentNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // “Ask WriteOffs?” drawer state
  const [askOpen, setAskOpen] = useState(false)

  useEffect(() => {
    if (open) {
      setNotes(currentNotes ?? '')
      setErr(null)
      setSaving(false)
      setAskOpen(false)
    }
  }, [open, currentNotes])

  async function approve() {
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/tx/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: txId, approved: true, notes: notes || null })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to approve')
      onApproved?.(notes || null)
      onClose()
    } catch (e: any) {
      setErr(e?.message || 'Failed to approve')
    } finally {
      setSaving(false)
    }
  }

  // Insert text from the “Ask WriteOffs?” drawer into the notes box
  function insertFromWriteOffs(text: string) {
    setNotes(prev => (prev ? `${prev}\n\n${text}` : text))
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Approve transaction"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-base font-semibold">Approve transaction</div>
          <button
            className="rounded-lg border px-2 py-1 text-xs"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <div className="px-4 py-3">
          <label className="block text-sm font-medium">Notes (optional)</label>
          <textarea
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="Attendees, purpose, why it’s a write-off…"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {err && <div className="mt-2 text-sm text-red-700">Error: {err}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <button
            onClick={() => setAskOpen(true)}
            className="rounded-xl border px-3 py-1.5 text-sm"
            title="Get an education-only answer with IRS citations"
          >
            Ask WriteOffs?
          </button>
          <button onClick={onClose} className="rounded-xl border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={approve}
            disabled={saving}
            className="rounded-xl btn btn-primary px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Approve'}
          </button>
        </div>
      </div>

      {/* Education-only drawer with citations; inserts summary into Notes */}
      <AskWriteOffsDrawer
        open={askOpen}
        onClose={() => setAskOpen(false)}
        txVendor={txVendor}
        txCategory={txCategory}
        onInsertNotes={insertFromWriteOffs}
      />
    </div>
  )
}
