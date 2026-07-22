/* File: app/review/BulkTable.tsx
 * Version: v13 (TS fix: Td supports title, children optional)
 */
'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import CategorySelect from './CategorySelect'
import AttachReceipt from './AttachReceipt'
import ApproveNotesModal from './ApproveNotesModal'

type Tx = {
  id: string
  date: string
  vendor: string
  description: string | null
  amount: string | number
  category_key: string | null
  has_receipt?: boolean
  receipt_waived?: boolean
  notes?: string | null
}

type Category = { key: string; label: string }

export default function BulkTable({
  txs,
  categories,
}: {
  txs: Tx[]
  categories: Category[]
}) {
  const [rows, setRows] = useState<Tx[]>(txs)
  useEffect(() => setRows(txs), [txs])

  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [bulkCat, setBulkCat] = useState<string>('') // '' = unset
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [viewBusy, setViewBusy] = useState<string | null>(null)

  const [approveOpen, setApproveOpen] = useState(false)
  const [approveTxId, setApproveTxId] = useState<string | null>(null)
  const [approveNotes, setApproveNotes] = useState<string | null>(null)
  const [approveVendor, setApproveVendor] = useState<string>('')
  const [approveCategory, setApproveCategory] = useState<string | null>(null)

  const allIds = useMemo(() => rows.map(t => t.id), [rows])
  const selectedIds = useMemo(() => allIds.filter(id => selected[id]), [allIds, selected])
  const allChecked = selectedIds.length === allIds.length && allIds.length > 0
  const anyChecked = selectedIds.length > 0

  function toggleAll(next: boolean) {
    const map: Record<string, boolean> = {}
    if (next) for (const id of allIds) map[id] = true
    setSelected(map)
  }
  function toggleOne(id: string, next: boolean) { setSelected(prev => ({ ...prev, [id]: next })) }

  async function applyBulk() {
    if (!anyChecked) return
    setBusy(true); setMsg(null); setErr(null)
    try {
      const res = await fetch('/api/tx/bulk-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, category_key: bulkCat || null })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Bulk update failed')

      setRows(prev => prev.map(r => selectedIds.includes(r.id) ? { ...r, category_key: (bulkCat || null) as string | null } : r))
      setMsg(`Updated ${data.updated ?? selectedIds.length} transactions.`)
      setSelected({})
    } catch (e: any) {
      setErr(e?.message || 'Bulk update failed')
    } finally {
      setBusy(false)
    }
  }

  function markHasReceipt(id: string) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, has_receipt: true } : r)))
  }

  async function setWaiver(id: string, waived: boolean) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, receipt_waived: waived } : r)))
    try {
      const res = await fetch('/api/tx/receipt-waiver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, waived })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to update waiver')
      }
    } catch (e) {
      setRows(prev => prev.map(r => (r.id === id ? { ...r, receipt_waived: !waived } : r)))
      setErr((e as Error).message || 'Failed to update waiver')
    }
  }

  async function deleteRow(id: string) {
    const confirm = window.confirm('Delete this transaction? This cannot be undone.')
    if (!confirm) return
    const prev = rows
    setRows(prev.filter(r => r.id !== id))
    try {
      const res = await fetch('/api/tx/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to delete')
      }
      setMsg('Deleted 1 transaction.')
    } catch (e) {
      setRows(prev)
      setErr((e as Error).message || 'Failed to delete')
    }
  }

  async function viewReceiptForTx(id: string) {
    try {
      setViewBusy(id)
      const res = await fetch(`/api/receipts/for-tx?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not fetch receipt')
      const receipts = Array.isArray(data?.receipts) ? data.receipts as { signed_url: string | null, created_at: string }[] : []
      if (receipts.length === 0) { alert('No receipt found for this transaction.'); return }
      const url = receipts[0]?.signed_url
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      else alert('Receipt link is unavailable.')
    } catch (e: any) {
      alert(e?.message || 'Could not open receipt')
    } finally {
      setViewBusy(null)
    }
  }

  function openApprove(id: string, currentNotes: string | null | undefined, vendor: string, category: string | null) {
    setApproveTxId(id); setApproveNotes(currentNotes ?? null); setApproveVendor(vendor); setApproveCategory(category); setApproveOpen(true)
  }
  function onApproved(notes: string | null) {
    if (!approveTxId) return
    setRows(prev => prev.map(r => (r.id === approveTxId ? { ...r, needs_review: false, notes: notes ?? r.notes } : r)))
  }

  return (
    <div className="overflow-x-auto rounded-2xl border">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />
            Select all
          </label>
          <span className="text-xs text-neutral-600">{selectedIds.length} selected</span>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="rounded-xl border px-2 py-1 text-sm"
            value={bulkCat}
            onChange={(e) => setBulkCat(e.target.value)}
            disabled={!anyChecked || busy}
            aria-label="Choose category for bulk apply"
          >
            <option value="">— Unset —</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <button onClick={applyBulk} disabled={!anyChecked || busy} className="btn btn-primary disabled:opacity-60">
            {busy ? 'Applying…' : 'Apply to selected'}
          </button>
        </div>
      </div>

      {/* Table */}
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50">
          <tr>
            <Th className="w-[40px]">&nbsp;</Th>
            <Th>Date</Th>
            <Th>Vendor</Th>
            <Th>Description</Th>
            <Th className="text-right">Amount</Th>
            <Th>Category</Th>
            <Th>Receipt / Actions</Th>
            <Th className="w-[1%]">&nbsp;</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100 transition-colors">
              <Td className="w-[40px]">
                <input type="checkbox" checked={!!selected[t.id]} onChange={(e) => toggleOne(t.id, e.target.checked)} />
              </Td>
              <Td>{t.date}</Td>
              <Td>{t.vendor}</Td>
              <Td className="max-w-[28ch] truncate" title={t.description || ''}>{t.description || '—'}</Td>
              <Td className="text-right font-mono">{formatAmount(t.amount)}</Td>
              <Td>
                <CategorySelect
                  key={`${t.id}:${t.category_key ?? ''}`}
                  id={t.id}
                  current={t.category_key}
                  categories={categories}
                />
              </Td>

              {/* Receipt + grouped actions with Approve underneath */}
              <Td>
                <div className="flex flex-wrap items-center gap-2">
                  {t.has_receipt ? (
                    <span title="Receipt attached">📎</span>
                  ) : t.receipt_waived ? (
                    <span title="Receipt not required">🚫</span>
                  ) : (
                    <span className="text-neutral-400" title="No receipt yet">—</span>
                  )}

                  {t.has_receipt && (
                    <button
                      onClick={() => viewReceiptForTx(t.id)}
                      disabled={viewBusy === t.id}
                      className="btn btn-secondary text-xs"
                      title="View receipt"
                    >
                      {viewBusy === t.id ? 'Opening…' : 'View'}
                    </button>
                  )}

                  {!t.has_receipt && (
                    <>
                      {!t.receipt_waived ? (
                        <button onClick={() => setWaiver(t.id, true)} className="btn btn-secondary text-xs" title="Mark not required">
                          Not required
                        </button>
                      ) : (
                        <button onClick={() => setWaiver(t.id, false)} className="btn btn-secondary text-xs" title="Clear waiver">
                          Clear waiver
                        </button>
                      )}
                    </>
                  )}

                  <AttachReceipt
                    transactionId={t.id}
                    txDate={t.date}
                    txAmount={typeof t.amount === 'string' ? Number(t.amount) : (t.amount as number)}
                    txVendor={t.vendor}
                    onAttached={() => markHasReceipt(t.id)}
                  />
                </div>

                {/* Approve aligned beneath receipt actions */}
                <div className="mt-2">
                  <button
                    onClick={() => openApprove(t.id, t.notes, t.vendor, t.category_key)}
                    className="btn btn-primary text-xs"
                    title="Approve and add notes"
                  >
                    Approve
                  </button>
                </div>
              </Td>

              {/* Delete column */}
              <Td>
                <button onClick={() => deleteRow(t.id)} className="btn btn-secondary text-xs" title="Delete">
                  Delete
                </button>
              </Td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <Td colSpan={8}>
                <div className="py-10 text-center text-neutral-600">
                  No transactions yet. Try <a href="/import" className="underline">importing a CSV</a>.
                </div>
              </Td>
            </tr>
          )}
        </tbody>
      </table>

      {(msg || err) && (
        <div className={`m-3 rounded-xl border p-3 text-sm ${err ? 'border-red-300 text-red-700' : 'border-green-300 text-green-700'}`}>
          {err || msg}
        </div>
      )}

      <ApproveNotesModal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        txId={approveTxId || ''}
        txVendor={approveVendor}
        txCategory={approveCategory}
        currentNotes={approveNotes || ''}
        onApproved={onApproved}
      />
    </div>
  )
}

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th>
}
function Td({
  children, className = '', colSpan, title,
}: {
  children?: ReactNode
  className?: string
  colSpan?: number
  title?: string
}) {
  return <td className={`px-3 py-2 align-top ${className}`} colSpan={colSpan} title={title}>{children}</td>
}
function formatAmount(a: string | number) {
  const n = typeof a === 'string' ? Number(a) : a
  if (Number.isNaN(n)) return a as any
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}
