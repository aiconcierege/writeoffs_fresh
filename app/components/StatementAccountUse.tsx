'use client'

import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { persistAccountUse, type AccountUseDesignation, type AccountUseRequest } from '../lib/bookkeeping/account-use-request'

export type StatementUseAccount = { id: string; displayName: string; mask: string | null; designation: string | null }
const subscribe = () => () => {}
const ready = () => true
const notReady = () => false

type SaveState = { request: AccountUseRequest; state: 'saving' | 'saved' | 'error' }

export function StatementAccountUse({ accounts, conversational=false, onSaved }: { accounts: StatementUseAccount[];conversational?:boolean;onSaved?:()=>void }) {
  const router = useRouter()
  // Native radio inputs can otherwise appear selected before React can save them.
  const interactive = useSyncExternalStore(subscribe, ready, notReady)
  const [saves, setSaves] = useState<Record<string, SaveState>>({})
  const busy = Object.values(saves).some(save => save.state === 'saving')
  async function save(id: string, request: AccountUseRequest) {
    setSaves(current => ({ ...current, [id]: { request, state: 'saving' } }))
    try {
      await persistAccountUse(id, request)
      setSaves(current => ({ ...current, [id]: { request, state: 'saved' } }))
      onSaved?.()
      router.refresh()
    } catch {
      setSaves(current => ({ ...current, [id]: { request, state: 'error' } }))
    }
  }
  function choose(id: string, designation: AccountUseDesignation) {
    const previous = saves[id]
    // A lost response can follow a committed save. Reuse its identity on retry.
    const request = previous?.state === 'error' && previous.request.designation === designation
      ? previous.request : { designation, effectiveAt: new Date().toISOString(), requestId: crypto.randomUUID() }
    void save(id, request)
  }
  if (!accounts.length) return null
  return <section aria-labelledby="statement-account-use" className="mx-auto max-w-3xl space-y-5 px-4 py-6">
    <h2 id="statement-account-use" className="text-xl font-semibold">{conversational?'Before I finish this, how did you use this account?':'How did you use these accounts?'}</h2>
    <p className="text-sm text-slate-600">Tell Betti once for each statement account. This applies to the activity you sent from that account. You can change it in Bank connections.</p>
    {!interactive && <p role="status">Preparing your account choices…</p>}
    <noscript>Please enable JavaScript to save your account choice.</noscript>
    {accounts.map(account => {
      const attempt = saves[account.id]
      const saved = attempt?.state === 'saved' ? attempt.request.designation : account.designation
      const statusId = `account-use-status-${account.id}`
      return <div key={account.id} className="border-b border-slate-200 pb-5">
        <fieldset disabled={!interactive || busy} aria-describedby={statusId}>
          <legend className="font-semibold">{account.displayName}{account.mask ? ` •••• ${account.mask}` : ''}</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{([['business_only', 'Business only'], ['business_and_personal', 'Business and personal']] as const).map(([value, label]) =>
            <label key={value} className={`flex min-h-12 items-center gap-3 rounded-lg border px-4 py-3 ${saved===value?'border-[#176c54] bg-[#f1f7f2]':'border-slate-300'}`}>
              <input type="radio" name={`statement-use-${account.id}`} value={value} checked={saved === value}
                onChange={() => choose(account.id, value)} /><span>{label}</span>
            </label>)}</div>
        </fieldset>
        <p id={statusId} role={attempt?.state === 'error' ? 'alert' : 'status'} className="mt-3 text-sm" aria-live="polite">
          {attempt?.state === 'saving' ? 'Saving your answer…' : attempt?.state === 'error'
            ? 'Your answer has not been confirmed. Please try again before continuing.'
            : attempt?.state === 'saved' ? 'Saved. Betti is reviewing the activity from this account.' : ''}
        </p>
        {attempt?.state === 'error' && <button className="btn btn-secondary mt-2" disabled={busy} onClick={() => void save(account.id, attempt.request)}>Try saving again</button>}
      </div>
    })}
  </section>
}
