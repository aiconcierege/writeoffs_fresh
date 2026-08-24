'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Fact = { id: string; fact_type: string; scope_kind: string; scope_key: string; fact_value: unknown }

export function DeductionProfile({ initialFacts }: { initialFacts: Fact[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const byType = new Map(initialFacts.filter((fact) => fact.scope_kind === 'business')
    .map((fact) => [fact.fact_type, fact]))

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('')
    const values = Object.fromEntries(new FormData(event.currentTarget))
    const changes = [
      ['home_office_regular_use', values.regularUse === 'yes'],
      ['home_office_exclusive_use', values.exclusiveUse === 'yes'],
      ['home_office_square_feet', Number(values.workspaceFeet)],
      ['home_total_square_feet', Number(values.homeFeet)],
    ] as const
    try {
      for (const [factType, value] of changes) {
        if ((typeof value === 'number' && (!Number.isInteger(value) || value < 1))) continue
        const prior = byType.get(factType)
        const response = await fetch('/api/deductions/facts', { method: 'POST', headers: {
          'content-type': 'application/json', 'idempotency-key': `deduction-${crypto.randomUUID()}` },
        body: JSON.stringify({ factType, scopeKind: 'business', scopeKey: 'business', value,
          expectedEventId: prior?.id ?? null }) })
        if (!response.ok) throw new Error('Could not save these details safely.')
      }
      setMessage('Home workspace details saved. WriteOffs will use them only when supported rules allow it.')
      router.refresh()
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Could not save these details.') }
    finally { setBusy(false) }
  }

  return <main className="page-container page-container-narrow">
    <header><p className="text-xs font-semibold tracking-[.16em] text-slate-500">DEDUCTION DETAILS</p>
      <h1 className="page-title">A few facts WriteOffs can remember</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">These answers help avoid repeated questions. They do not guarantee a deduction or certify tax eligibility.</p></header>
    <form onSubmit={save} className="surface mt-8 p-5 sm:p-7">
      <h2 className="text-xl font-semibold">Home workspace</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Choice name="regularUse" label="Do you regularly work from an area of your home for this business?" value={byType.get('home_office_regular_use')?.fact_value} />
        <Choice name="exclusiveUse" label="Is that area used only for your business?" value={byType.get('home_office_exclusive_use')?.fact_value} />
        <NumberField name="workspaceFeet" label="Approximate workspace square feet" value={byType.get('home_office_square_feet')?.fact_value} />
        <NumberField name="homeFeet" label="Approximate total home square feet" value={byType.get('home_total_square_feet')?.fact_value} />
      </div>
      <button disabled={busy} className="btn btn-primary mt-6">{busy?'Saving…':'Save details'}</button>
      {message&&<p role="status" className="notice notice-success mt-4">{message}</p>}
    </form>
    <section className="mt-8 border-t border-slate-200 pt-7"><h2 className="text-lg font-semibold">Shared phone and internet use</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">When WriteOffs identifies a supported recurring service, it will ask for the approximate business-use percentage once and remember that answer for the same service.</p></section>
  </main>
}

function Choice({name,label,value}:{name:string;label:string;value:unknown}){return <fieldset><legend className="text-sm font-medium text-slate-800">{label}</legend><div className="mt-3 grid grid-cols-2 gap-2"><label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-[#dce3de] px-4"><input type="radio" name={name} value="yes" defaultChecked={value===true} required/> Yes</label><label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-[#dce3de] px-4"><input type="radio" name={name} value="no" defaultChecked={value===false}/> No</label></div></fieldset>}
function NumberField({name,label,value}:{name:string;label:string;value:unknown}){return <label className="grid gap-2 text-sm font-medium text-slate-800">{label}<input className="field" name={name} inputMode="numeric" type="number" min="1" max="100000" defaultValue={typeof value==='number'?value:''}/></label>}
