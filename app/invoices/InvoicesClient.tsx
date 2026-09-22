'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, type ReactNode } from 'react'
import { AuthenticatedPage } from '../components/ui'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const today = () => new Date().toISOString().slice(0, 10)
const date = (value: unknown) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${String(value)}T00:00:00Z`)) : null

export function InvoicesClient({ initialInvoices }: { initialInvoices: Record<string, unknown>[] }) {
  const router = useRouter(), key = useRef(crypto.randomUUID())
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const composer = useRef<HTMLDetailsElement>(null)
  const hasInvoices = initialInvoices.length > 0
  return <AuthenticatedPage className="invoices-page premium-utility" eyebrow="Invoices" title="Get paid for your work." description={<>Create an invoice for your customer.<span className="invoice-introduction"> I’ll add the income to your books when you get paid.</span></>} actions={hasInvoices ? <button className="btn btn-primary" onClick={() => { if (composer.current) { composer.current.open = true; composer.current.querySelector<HTMLInputElement>('[name="customerName"]')?.focus() } }}>+ Create invoice</button> : undefined}>
    {hasInvoices && <section aria-labelledby="invoice-history-heading" className="invoice-history">
      <h2 id="invoice-history-heading" className="section-heading">Your invoices</h2>
      <div className="authenticated-ledger invoice-list">{initialInvoices.map(invoice => <Link key={String(invoice.id)} href={`/invoices/${invoice.id}`} className="invoice-row">
        <div className="invoice-customer"><strong>{String(invoice.customer_name)}</strong><p>{String(invoice.description)}</p><span>{String(invoice.invoice_number)}{invoice.issue_date ? ` · Issued ${date(invoice.issue_date)}` : ''}{invoice.due_date ? ` · Due ${date(invoice.due_date)}` : ''}</span></div>
        <div className="invoice-value"><strong>{money.format(Number(invoice.amount_cents) / 100)}</strong><span>{status(String(invoice.status))}</span></div>
      </Link>)}</div>
    </section>}
    <details ref={composer} className={`invoice-composer ${hasInvoices ? 'invoice-composer-returning' : ''}`} open={!hasInvoices || undefined}>
      <summary className="invoice-create-toggle">Create invoice <span aria-hidden="true">＋</span></summary>
      <form className="authenticated-form-surface" onSubmit={async event => {
        event.preventDefault(); setBusy(true); setError(null)
        const form = new FormData(event.currentTarget), body = Object.fromEntries(form)
        const response = await fetch('/api/invoices', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `invoice-${key.current}` }, body: JSON.stringify(body) }), data = await response.json().catch(() => ({}))
        setBusy(false)
        if (!response.ok) { setError(data.error ?? 'Invoice could not be created.'); return }
        router.push(`/invoices/${data.id}`)
      }}>
        <fieldset className="form-group"><legend>Bill to</legend><div className="form-group-fields">
          <Field label="Customer"><input required name="customerName" className="field" autoComplete="organization" /></Field>
          <Field label="Customer email (optional)"><input name="customerEmail" type="email" className="field" autoComplete="email" /></Field>
        </div></fieldset>
        <fieldset className="form-group"><legend>For</legend><div className="form-group-fields">
          <Field label="What was the work?" wide><input required name="description" className="field" /></Field>
        </div></fieldset>
        <div className="invoice-amount"><label htmlFor="invoice-amount">Amount</label><div><span aria-hidden="true">$</span><input id="invoice-amount" aria-label="Amount in US dollars" required name="amount" inputMode="decimal" placeholder="0.00"/></div><span>USD</span></div>
        <fieldset className="form-group"><legend>When</legend><div className="form-group-fields">
          <Field label="Issue date"><input required name="issueDate" type="date" max={today()} defaultValue={today()} className="field" /></Field>
          <Field label="Due date (optional)"><input name="dueDate" type="date" className="field" /></Field>
        </div></fieldset>
        <details className="form-secondary-details"><summary>Additional details <span>(optional)</span></summary><div className="form-group-fields">
          <Field label="Job or project (optional)" wide><input name="jobLabel" className="field" /></Field>
          <Field label="Address or location (optional)" wide><input name="location" className="field" /></Field>
          <Field label="Note (optional)" wide><textarea name="note" rows={3} className="field py-3" /></Field>
        </div></details>
        {error && <p role="alert" className="notice notice-error mt-4">{error}</p>}
        <button disabled={busy} className="btn btn-primary mt-6 w-full sm:w-auto">{busy ? 'Creating…' : <>Create invoice <span aria-hidden="true">→</span></>}</button>
      </form>
    </details>
  </AuthenticatedPage>
}
function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={`grid gap-2 text-sm font-medium text-slate-800 ${wide ? 'sm:col-span-2' : ''}`}>{label}{children}</label>
}
function status(value: string) { return value === 'paid' ? 'Paid' : value === 'canceled' ? 'Canceled' : 'Awaiting payment' }
