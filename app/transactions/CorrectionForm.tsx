'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function CorrectionForm({ transactionId, currentDecisionId, totalCents }: {
  transactionId: string; currentDecisionId: string; totalCents: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [use, setUse] = useState<'business'|'personal'|'mixed'>('business')
  const [personal, setPersonal] = useState('')
  const [error, setError] = useState<string|null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true); setError(null)
    if (use === 'mixed' && !/^\d+(?:\.\d{1,2})?$/.test(personal.trim())) {
      setError('Enter a positive dollar amount with no more than two decimal places.')
      setBusy(false); return
    }
    const cents = Math.round(Number(personal) * 100)
    const answer = use === 'mixed' ? { schemaVersion: 1, use, personalAmountCents: cents }
      : { schemaVersion: 1, use }
    try {
      const response = await fetch(`/api/bookkeeping/transactions/${transactionId}/correction`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedCurrentDecisionId: currentDecisionId,
          correctionRequestId: crypto.randomUUID(), answer }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to save correction.')
      setOpen(false); router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save correction.') }
    finally { setBusy(false) }
  }
  if (!open) return <button onClick={() => setOpen(true)} className="text-sm font-semibold text-[#243186] underline-offset-4 hover:underline">Correct this</button>
  return <div className="mt-4 border-l-2 border-[#243186] pl-4">
    <p className="font-medium text-slate-950">Was this purchase for your business?</p>
    <div className="mt-3 flex flex-wrap gap-2">{([['business','Business'],['personal','Personal'],['mixed','Both']] as const).map(([value,label]) =>
      <button key={value} onClick={() => setUse(value)} className={`rounded-md border px-3 py-2 text-sm ${use === value ? 'border-[#243186] bg-[#243186] text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{label}</button>)}</div>
    {use === 'mixed' && <label className="mt-4 block text-sm text-slate-700">About how much was personal?
      <span className="mt-1 flex max-w-xs items-center rounded-md border border-slate-300 bg-white px-3"><span>$</span><input value={personal} onChange={(event) => setPersonal(event.target.value)} inputMode="decimal" placeholder="0.00" className="min-h-10 w-full px-2 outline-none" /></span>
      <span className="mt-1 block text-xs text-slate-500">Enter less than {(Math.abs(totalCents)/100).toFixed(2)}.</span></label>}
    {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    <div className="mt-4 flex gap-3"><button onClick={save} disabled={busy} className="rounded-md bg-[#243186] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save correction'}</button>
      <button onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-slate-600">Cancel</button></div>
  </div>
}
