'use client'
import { useRef, useState } from 'react'
import type { WorkAction } from '../../lib/bookkeeping/betti-work'
import type { GuidedWorkProjection } from '../../lib/bookkeeping/guided-work-projection'
import { DocumentIntake } from '../../documents/DocumentIntake'
import { MerchantIdentity } from './MerchantIdentity'

const date = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'))
export function CatchUpStep({ action, busy, perform, onPending, onProvided }: {
  action: WorkAction; busy: boolean
  perform: (command: () => Promise<GuidedWorkProjection | void>, deferred?: boolean) => Promise<void>
  onPending: (pending: boolean, message?: string) => void
  onProvided: (ids: string[], command: () => Promise<GuidedWorkProjection | void>) => Promise<void>
}) {
  const [selected, setSelected] = useState<string[]>([]), [uploading, setUploading] = useState(false)
  const retry = useRef<{ signature: string; id: string } | null>(null)
  const journey = action.journey!, stage = journey.stage
  function save(response: 'continue' | 'none' | 'later' | 'uploaded' | 'reviewed', documentIds: string[] = []) {
    const command = async () => {
      const payload = { actionId: action.id, version: action.version, journey, items: action.items ?? [],
        response, documentIds, selectedIds: response === 'reviewed' ? selected : [] }
      const signature = JSON.stringify(payload)
      if (retry.current?.signature !== signature) retry.current = { signature, id: crypto.randomUUID() }
      const result = await fetch('/api/bookkeeping/work/catch-up', { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-betti-guided': '1' },
        body: JSON.stringify({ ...payload, requestId: retry.current.id }), signal: AbortSignal.timeout(15000) })
      const body = await result.json()
      if (!result.ok) throw new Error(body.error ?? 'Please try again.')
      return body.work as GuidedWorkProjection | undefined
    }
    return response === 'uploaded' ? onProvided(documentIds, command) : perform(command, response === 'later')
  }
  const personal = stage === 'personal', review = personal || stage === 'nonexpense'
  return <>
    <p className="betti-workstream">Earlier books · {date(journey.from)} – {date(journey.through)}</p>
    <h1>{stage === 'statements' ? 'Let’s gather your earlier statements.' : stage === 'receipts'
      ? journey.moreReceipts ? 'Any more receipts?' : 'Before I ask you anything, send me the receipts you have.'
      : personal ? 'Are any of these personal?' : 'Are any of these not expenses for this business?'}</h1>
    <p className="betti-explanation">{stage === 'statements' ? 'I can keep working with what you’ve sent. These are the periods I’m still missing.'
      : stage === 'receipts' ? 'Receipts and bills may answer some of my questions for you.'
      : personal ? 'I’m treating these as business because they came from your business account. Select anything that was personal.'
      : 'These look like costs of running your business. Select anything that was actually another kind of money movement. I’ll ask only what I need to understand it.'}</p>
    {stage === 'statements' && <ul className="my-5 space-y-2">{journey.missingPeriods?.map((p, i) => <li key={i}>{date(p.from)} – {date(p.through)}</li>)}</ul>}
    {!review && <DocumentIntake guided compact primary disabled={busy} buttonLabel={stage === 'statements' ? 'Send statements' : journey.moreReceipts ? 'Add more receipts' : 'Send receipts'}
      onUploadState={(pending, result) => {
        setUploading(pending); onPending(pending, 'Receiving your documents…')
        if (!pending && result?.documentIds.length) void save('uploaded', result.documentIds)
      }} />}
    {review && (journey.reviewRemaining??0)>(action.items?.length??0) && <p className="mt-4 text-sm text-slate-600">Showing {action.items?.length} of {journey.reviewRemaining} remaining items. We’ll review the next group afterward.</p>}
    {review && <fieldset className="my-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-4">
      <legend className="sr-only">{personal ? 'Select personal activity' : 'Select activity that was not a business expense'}</legend>
      {action.items?.map(item => <label key={item.recordId} className="flex cursor-pointer items-center gap-4 py-4">
        <input type="checkbox" className="h-5 w-5 shrink-0 accent-[#243186]" disabled={busy} checked={selected.includes(item.recordId)}
          onChange={e => setSelected(ids => e.target.checked ? [...ids, item.recordId] : ids.filter(id => id !== item.recordId))} />
        <span className="min-w-0 flex-1"><MerchantIdentity compact merchant={item.merchant} date={item.date} amountCents={item.amountCents} /></span>
      </label>)}
    </fieldset>}
    <div className="betti-continue">
      <button className={`btn ${review ? 'btn-primary' : 'btn-secondary'}`} disabled={busy || uploading} onClick={() => void save(review ? 'reviewed' : stage === 'receipts' && !journey.moreReceipts ? 'none' : 'continue')}>
        {review ? selected.length ? personal ? 'Mark selected as personal' : 'Help Betti understand selected items'
          : personal ? 'Everything here was for my business' : 'These were all business expenses'
          : stage === 'statements' ? 'Keep working with what I sent' : journey.moreReceipts ? 'That’s all I have' : 'I don’t have any'}
      </button>
      <button className="betti-defer" disabled={busy || uploading} onClick={() => void save('later')}>
        {stage === 'receipts' && journey.moreReceipts ? 'I’ll add more later' : 'I’ll do this later'}
      </button>
    </div>
  </>
}
