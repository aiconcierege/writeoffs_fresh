'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import AttachReceipt from '../review/AttachReceipt'

export function ReceiptActions({ transactionId, recordId, useRecordTarget, date, amount, vendor, links,
  canMarkLost }: { transactionId: string; recordId: string; useRecordTarget: boolean; date: string; amount: number; vendor: string;
    links: { id: string; receiptId: string }[]; canMarkLost: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState<string|null>(null);const[adding,setAdding]=useState(links.length===0)
  async function act(url: string, method = 'POST') {
    setBusy(true); setError(null)
    try { const response = await fetch(url, { method }); const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to update receipt.')
      router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update receipt.') }
    finally { setBusy(false) }
  }
  return <div className="mt-4">
    {adding&&<AttachReceipt canonical canonicalRecord={useRecordTarget} transactionId={useRecordTarget ? recordId : transactionId} txDate={date} txAmount={amount} txVendor={vendor} onAttached={() => router.refresh()} />}
    {links.length>0&&<details className="mt-2 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-semibold text-[#243186]">Receipt options</summary><div className="flex flex-wrap items-center gap-3 border-l border-slate-200 pl-3">
      {!adding&&<button type="button" className="min-h-11 text-sm font-semibold text-[#243186]" onClick={()=>setAdding(true)}>Add another receipt</button>}
    {links.map((link) => <button key={link.id} disabled={busy} onClick={() => act(useRecordTarget ? `/api/bookkeeping/records/${recordId}/receipts/${link.id}` : `/api/bookkeeping/transactions/${transactionId}/receipts/${link.id}`, 'DELETE')}
      className="min-h-11 text-xs font-medium text-slate-600 underline-offset-4 hover:underline">Remove attached receipt</button>)}
    {canMarkLost && <button disabled={busy} onClick={() => act(`/api/bookkeeping/transactions/${transactionId}/receipt-lost`)}
      className="text-xs font-medium text-slate-600 underline-offset-4 hover:underline">I don’t have the receipt</button>}
    </div></details>}
    {links.length===0&&canMarkLost && <button disabled={busy} onClick={() => act(`/api/bookkeeping/transactions/${transactionId}/receipt-lost`)} className="mt-2 min-h-11 text-xs font-medium text-slate-600 underline-offset-4 hover:underline">I don’t have the receipt</button>}
    {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
  </div>
}
