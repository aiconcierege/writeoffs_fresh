'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type StatementUseAccount = { id: string; displayName: string; mask: string | null; designation: string | null }

export function StatementAccountUse({ accounts }: { accounts: StatementUseAccount[] }) {
  const router = useRouter()
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [choices, setChoices] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(accounts.map(account => [account.id, account.designation])))
  async function save(id: string, designation: string) {
    const previous = choices[id] ?? null
    setChoices(current => ({ ...current, [id]: designation }))
    setSaving(id); setMessage('')
    try {
      const response = await fetch(`/api/bookkeeping/accounts/${id}/use`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ designation,
          effectiveAt: new Date().toISOString(), requestId: crypto.randomUUID() }) })
      if (!response.ok) throw new Error('save failed')
      setMessage('Saved. Betti will use this for the activity from this account.'); router.refresh()
    } catch {
      setChoices(current => ({ ...current, [id]: previous }))
      setMessage('That choice could not be saved. Please try again.')
    }
    finally { setSaving(null) }
  }
  if (!accounts.length) return null
  return <section aria-labelledby="statement-account-use" className="mx-auto max-w-3xl space-y-5 px-4 py-6">
    <h2 id="statement-account-use" className="text-xl font-semibold">How did you use these accounts?</h2>
    <p className="text-sm text-slate-600">Tell Betti once for each statement account. This applies to the activity you sent from that account. You can change it in Bank connections.</p>
    {accounts.map(account => <fieldset key={account.id} disabled={saving !== null} className="border-b border-slate-200 pb-5">
      <legend className="font-semibold">{account.displayName}{account.mask ? ` •••• ${account.mask}` : ''}</legend>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{[['business_only', 'Business only'], ['business_and_personal', 'Business and personal']].map(([value, label]) =>
        <label key={value} className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-300 px-4 py-3">
          <input type="radio" name={`statement-use-${account.id}`} checked={choices[account.id] === value}
            onChange={() => void save(account.id, value)} /><span>{label}</span>
        </label>)}</div>
    </fieldset>)}
    <p role="status" aria-live="polite" className="text-sm">{message}</p>
  </section>
}
