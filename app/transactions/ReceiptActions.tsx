'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import AttachReceipt from '../review/AttachReceipt'

export function ReceiptActions({ transactionId, date, amount, vendor, links,
  canMarkLost }: { transactionId: string; date: string; amount: number; vendor: string;
    links: { id: string; receiptId: string }[]; canMarkLost: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState<string|null>(null)
  async function act(url: string, method = 'POST') {
    setBusy(true); setError(null)
    try { const response = await fetch(url, { method }); const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to update receipt.')
      router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update receipt.') }
    finally { setBusy(false) }
  }
  return <div className="mt-4 flex flex-wrap items-center gap-3">
    <AttachReceipt canonical transactionId={transactionId} txDate={date} txAmount={amount} txVendor={vendor} onAttached={() => router.refresh()} />
    {links.map((link) => <button key={link.id} disabled={busy} onClick={() => act(`/api/bookkeeping/transactions/${transactionId}/receipts/${link.id}`, 'DELETE')}
      className="text-xs font-medium text-slate-600 underline-offset-4 hover:underline">Remove attached receipt</button>)}
    {canMarkLost && <button disabled={busy} onClick={() => act(`/api/bookkeeping/transactions/${transactionId}/receipt-lost`)}
      className="text-xs font-medium text-slate-600 underline-offset-4 hover:underline">I don’t have the receipt</button>}
    {error && <p className="w-full text-sm text-red-700">{error}</p>}
  </div>
}
