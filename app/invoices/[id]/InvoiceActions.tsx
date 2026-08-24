'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Invoice = Record<string, unknown>
type Candidate = { recordId: string; date: string | null; merchant: string; description: string | null }

export function InvoiceActions({ invoice, candidates }: { invoice: Invoice; candidates: Candidate[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function post(url: string, body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': `invoice-${crypto.randomUUID()}` },
      body: JSON.stringify({ ...body, expectedEventId: invoice.current_event_id }),
    })
    setBusy(false)
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      setError(data.error ?? 'Invoice could not be updated.')
      return
    }
    router.refresh()
  }

  async function correct(form: FormData) {
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/invoices/${invoice.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': `invoice-${crypto.randomUUID()}` },
      body: JSON.stringify({ ...Object.fromEntries(form), expectedEventId: invoice.current_event_id }),
    })
    setBusy(false)
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      setError(data.error ?? 'Invoice could not be corrected.')
      return
    }
    router.refresh()
  }

  const awaiting = invoice.status === 'awaiting_payment'
  return <section className="border-t border-slate-200 pt-7">
    <div className="flex flex-wrap gap-3">
      <Link href={`/invoices/${invoice.id}/print`}
        className="inline-flex min-h-11 items-center rounded-md bg-[#243186] px-4 text-sm font-semibold text-white">
        View and download
      </Link>
      {awaiting && invoice.event_type !== 'sent' && <button disabled={busy}
        onClick={() => post(`/api/invoices/${invoice.id}/status`, { action: 'sent' })}
        className="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold disabled:opacity-50">
        Mark as shared
      </button>}
      {awaiting && <button disabled={busy}
        onClick={() => post(`/api/invoices/${invoice.id}/status`, { action: 'canceled' })}
        className="min-h-11 px-4 text-sm font-semibold text-red-700 disabled:opacity-50">
        Cancel invoice
      </button>}
    </div>

    {awaiting && <details className="mt-7 rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">Correct invoice details</summary>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault()
        void correct(new FormData(event.currentTarget))
      }}>
        <Field label="Customer"><input required name="customerName" className="field" defaultValue={String(invoice.customer_name)} /></Field>
        <Field label="Customer email (optional)"><input name="customerEmail" type="email" className="field" defaultValue={String(invoice.customer_email ?? '')} /></Field>
        <Field label="Amount"><input required name="amount" inputMode="decimal" className="field" defaultValue={(Number(invoice.amount_cents) / 100).toFixed(2)} /></Field>
        <Field label="Issue date"><input required name="issueDate" type="date" className="field" defaultValue={String(invoice.issue_date)} /></Field>
        <Field label="What was this for?" wide><input required name="description" className="field" defaultValue={String(invoice.description)} /></Field>
        <Field label="Due date (optional)"><input name="dueDate" type="date" className="field" defaultValue={String(invoice.due_date ?? '')} /></Field>
        <Field label="Job or project (optional)"><input name="jobLabel" className="field" defaultValue={String(invoice.job_label ?? '')} /></Field>
        <Field label="Address or location (optional)" wide><input name="location" className="field" defaultValue={String(invoice.location ?? '')} /></Field>
        <Field label="Note (optional)" wide><textarea name="note" rows={3} className="field" defaultValue={String(invoice.note ?? '')} /></Field>
        <button disabled={busy} className="min-h-11 rounded-md bg-[#243186] px-4 text-sm font-semibold text-white disabled:opacity-50 sm:w-fit">
          {busy ? 'Saving…' : 'Save correction'}
        </button>
      </form>
    </details>}

    {awaiting && <div className="mt-8">
      <h2 className="text-lg font-semibold">Payment</h2>
      {candidates.length === 0
        ? <p className="mt-2 text-sm text-slate-600">No exact business-income payment is ready to link yet.</p>
        : candidates.length === 1
          ? <div className="mt-3 rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-700">Is this payment from {String(invoice.customer_name)} for this invoice?</p>
            <p className="mt-1 font-medium">{candidates[0].merchant} · {candidates[0].date}</p>
            <button disabled={busy}
              onClick={() => post(`/api/invoices/${invoice.id}/payment`, { bookkeepingRecordId: candidates[0].recordId })}
              className="mt-3 min-h-11 text-sm font-semibold text-[#243186] disabled:opacity-50">
              Yes, mark invoice paid
            </button>
          </div>
          : <p className="mt-2 text-sm text-slate-600">More than one payment could fit. WriteOffs will leave this invoice awaiting payment until the right payment is clear.</p>}
    </div>}
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
  </section>
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`grid gap-2 text-sm font-medium text-slate-800 ${wide ? 'sm:col-span-2' : ''}`}>
    {label}{children}
  </label>
}
