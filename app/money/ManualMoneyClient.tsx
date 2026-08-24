'use client'

import { useRef, useState } from 'react'
import { manualPaymentMethodLabel, type ManualMoneyDirection } from '../lib/manual-money/validation'

type Activity = Record<string, unknown>
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const today = () => new Date().toISOString().slice(0, 10)

export function ManualMoneyClient({ initialActivities, initialDirection }: {
  initialActivities: Activity[]; initialDirection: ManualMoneyDirection
}) {
  const [activities, setActivities] = useState(initialActivities)
  const [direction, setDirection] = useState(initialDirection)
  const [editing, setEditing] = useState<Activity | null>(null)
  async function refresh() {
    const response = await fetch('/api/manual-money/list', { cache: 'no-store' })
    if (response.ok) setActivities((await response.json()).activities)
  }
  return <main className="min-h-screen bg-[#fbfbfa]"><div className="mx-auto max-w-3xl px-4 py-9 sm:px-6 sm:py-14">
    <header><p className="text-xs font-semibold tracking-[0.16em] text-slate-500">MONEY OUTSIDE CONNECTED ACCOUNTS</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.025em] text-slate-950">Tell WriteOffs what happened</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Record business money that may never appear in a connected account.</p></header>
    <div className="mt-7 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1" role="group" aria-label="Activity type">
      {(['received','spent'] as const).map((kind) => <button key={kind} onClick={() => { setDirection(kind); setEditing(null) }}
        aria-pressed={direction === kind} className={`min-h-12 rounded-md px-3 text-sm font-semibold ${direction === kind ? 'bg-white text-[#243186] shadow-sm' : 'text-slate-600'}`}>
        Record money {kind}</button>)}</div>
    <MoneyForm key={`${direction}:${String(editing?.id ?? 'new')}`} direction={direction} activity={editing}
      onDone={async () => { setEditing(null); await refresh() }} />
    <section className="mt-12 border-t border-slate-200 pt-8"><h2 className="text-xl font-semibold text-slate-950">Recorded activity</h2>
      {activities.length === 0 ? <p className="mt-4 text-sm text-slate-600">Nothing recorded here yet.</p>
        : <div className="mt-4 grid gap-3">{activities.map((activity) => <article key={String(activity.manual_financial_source_id)} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate font-medium text-slate-950">{String(activity.counterparty_name ?? activity.description ?? (activity.direction === 'received' ? 'Money received' : 'Money spent'))}</p>
            <p className="mt-1 text-sm text-slate-600">{String(activity.occurred_on)} · {manualPaymentMethodLabel(String(activity.payment_method))}</p>
            {activity.job_label ? <p className="mt-1 text-sm text-slate-500">{String(activity.job_label)}</p> : null}</div>
            <p className={`font-semibold tabular-nums ${Number(activity.amount_cents) > 0 ? 'text-emerald-800' : 'text-slate-950'}`}>{money.format(Number(activity.amount_cents) / 100)}</p></div>
          <div className="mt-4 flex gap-5"><button className="min-h-11 text-sm font-semibold text-[#243186]" onClick={() => { setDirection(activity.direction as ManualMoneyDirection); setEditing(activity); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Correct</button>
            {activity.bank_match && typeof activity.bank_match === 'object' ? <button className="min-h-11 text-sm font-semibold text-[#243186]" onClick={async()=>{const match=activity.bank_match as {financialTransactionId:string;label:string};if(!confirm(`Is this the same activity as ${match.label}?`))return;const response=await fetch(`/api/manual-money/${activity.manual_financial_source_id}/match`,{method:'POST',headers:{'content-type':'application/json','idempotency-key':`manual-match-${crypto.randomUUID()}`},body:JSON.stringify({expectedEventId:activity.id,financialTransactionId:match.financialTransactionId})});if(response.ok)await refresh()}}>Match bank activity</button>:null}
            <button className="min-h-11 text-sm font-semibold text-red-700" onClick={async () => { if (!confirm('Remove this from your current business records?')) return; const response = await fetch(`/api/manual-money/${activity.manual_financial_source_id}`, { method:'DELETE', headers:{'content-type':'application/json','idempotency-key':`manual-remove-${crypto.randomUUID()}`}, body:JSON.stringify({expectedEventId:activity.id}) }); if (response.ok) await refresh() }}>Remove</button></div>
        </article>)}</div>}
    </section>
  </div></main>
}

function MoneyForm({ direction, activity, onDone }: { direction: ManualMoneyDirection; activity: Activity | null; onDone: () => Promise<void> }) {
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null); const key=useRef(crypto.randomUUID())
  const received = direction === 'received'; const amount = activity ? Math.abs(Number(activity.amount_cents)) / 100 : ''
  const inputClass="min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none focus:border-[#243186] focus:ring-2 focus:ring-[#243186]/15"
  return <form className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" onSubmit={async(event)=>{event.preventDefault();setBusy(true);setError(null);const form=new FormData(event.currentTarget)
    const body={direction,amount:form.get('amount'),occurredOn:form.get('occurredOn'),paymentMethod:form.get('paymentMethod'),counterpartyName:form.get('counterpartyName'),description:form.get('description'),jobLabel:form.get('jobLabel'),location:form.get('location'),note:form.get('note'),expectedEventId:activity?.id}
    const response=await fetch(activity?`/api/manual-money/${activity.manual_financial_source_id}`:'/api/manual-money',{method:activity?'PATCH':'POST',headers:{'content-type':'application/json','idempotency-key':`manual-${key.current}`},body:JSON.stringify(body)});const data=await response.json().catch(()=>({}));setBusy(false);if(!response.ok){setError(data.error??'This activity could not be saved.');return}await onDone();if(!activity)(event.target as HTMLFormElement).reset()}}>
    <h2 className="text-lg font-semibold text-slate-950">{activity?'Correct': 'Record'} money {direction}</h2>
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Amount"><input name="amount" inputMode="decimal" required defaultValue={amount} placeholder="0.00" className={inputClass} /></Field>
      <Field label="Date"><input name="occurredOn" type="date" required max={today()} defaultValue={String(activity?.occurred_on ?? today())} className={inputClass} /></Field>
      <Field label="How was it paid?"><select name="paymentMethod" required defaultValue={String(activity?.payment_method ?? '')} className={inputClass}><option value="" disabled>Choose one</option>
        {(received?[['cash','Cash'],['check','Check'],['zelle_ach','Zelle / ACH'],['card','Card'],['other','Other']]:[['cash','Cash'],['personal_card_account','Personal card/account'],['check','Check'],['other','Other']]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label={received?'Customer (optional)':'Merchant or vendor (optional)'}><input name="counterpartyName" defaultValue={String(activity?.counterparty_name ?? '')} className={inputClass} /></Field>
      <Field label={received?'What was this for? (optional)':'What was purchased? (optional)'} wide><input name="description" defaultValue={String(activity?.description ?? '')} className={inputClass} /></Field>
      <Field label="Job or project (optional)"><input name="jobLabel" defaultValue={String(activity?.job_label ?? '')} className={inputClass} /></Field>
      <Field label="Address or location (optional)"><input name="location" defaultValue={String(activity?.location ?? '')} className={inputClass} /></Field>
      <Field label="Note (optional)" wide><textarea name="note" rows={3} defaultValue={String(activity?.note ?? '')} className={`${inputClass} py-3`} /></Field></div>
    {error?<p role="alert" className="mt-4 text-sm text-red-700">{error}</p>:null}<button disabled={busy} className="mt-5 min-h-12 w-full rounded-md bg-[#243186] px-5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto">{busy?'Saving…':activity?'Save correction':received?'Record money received':'Record money spent'}</button>
  </form>
}

function Field({label,wide,children}:{label:string;wide?:boolean;children:React.ReactNode}){return <label className={`grid gap-2 text-sm font-medium text-slate-800 ${wide?'sm:col-span-2':''}`}>{label}{children}</label>}
