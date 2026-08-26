'use client'

import Link from 'next/link'
import { useState } from 'react'
import BankConnect from '../components/BankConnect'

type ReceiptAnswer = 'most' | 'some' | 'none' | null
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

export function GetStartedFlow({ initialCheckInWeekday, ...props }: React.ComponentProps<typeof BankConnect> & { initialCheckInWeekday: number | null }) {
  const [receiptAnswer, setReceiptAnswer] = useState<ReceiptAnswer>(null)
  const [day, setDay] = useState<number | null>(initialCheckInWeekday)
  const [cadenceSaved, setCadenceSaved] = useState(initialCheckInWeekday !== null)
  const [error, setError] = useState('')

  async function saveCadence(value: number) {
    setDay(value); setError('')
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const dateParts = new Intl.DateTimeFormat('en-US', { timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
    const date = Object.fromEntries(dateParts.map((part) => [part.type, part.value]))
    const effectiveFrom = `${date.year}-${date.month}-${date.day}`
    const response = await fetch('/api/bookkeeping/review-cadence', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-writeoffs-timezone': timezone }, body: JSON.stringify({
        checkInWeekday: value, effectiveFrom,
        requestId: crypto.randomUUID(),
      }) })
    if (!response.ok) { setError('Your check-in day could not be saved.'); return }
    setCadenceSaved(true)
  }

  return <div className="space-y-14">
    <section aria-labelledby="connect-heading">
      <p className="eyebrow">Start here</p>
      <h1 id="connect-heading" className="page-title">Let WriteOffs get to work.</h1>
      <p className="page-description">Connect your accounts and WriteOffs will begin organizing the activity it finds. You can leave while it works.</p>
      <div className="mt-7"><BankConnect {...props}/></div>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link href="/import" className="font-semibold text-[#243186]">Upload statements or a CSV</Link>
        <Link href="/receipts" className="font-semibold text-[#243186]">Start with receipts instead</Link>
      </div>
    </section>

    <section className="section-rule" aria-labelledby="receipts-heading">
      <h2 id="receipts-heading" className="section-heading">Do you have receipts for these purchases?</h2>
      <p className="section-description">Whatever you have is useful. WriteOffs will figure out which purchases they belong to.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">{([
        ['most','Most or all of them'],['some','Some of them'],['none','None right now'],
      ] as const).map(([value,label]) => <button type="button" key={value} onClick={() => setReceiptAnswer(value)}
        className={`min-h-14 rounded-xl border px-4 text-left text-sm font-semibold ${receiptAnswer===value?'border-[#243186] bg-[#f1f2fb]':'border-[#dce3de] bg-white'}`}>{label}</button>)}</div>
      {(receiptAnswer==='most'||receiptAnswer==='some')&&<div className="mt-5"><Link href="/receipts" className="btn btn-primary">Upload whatever you have</Link><p className="mt-2 text-sm text-[#59665f]">WriteOffs will match them automatically. Unmatched receipts won’t hold you up.</p></div>}
      {receiptAnswer==='none'&&<p className="mt-5 text-sm text-[#59665f]">That’s okay. You can add receipts anytime.</p>}
    </section>

    <section className="section-rule" aria-labelledby="cadence-heading">
      <h2 id="cadence-heading" className="section-heading">When should I check in with you?</h2>
      <p className="section-description">Pick a normal day. If there’s nothing to review, WriteOffs won’t bother you.</p>
      <label className="mt-5 block max-w-sm text-sm font-semibold">Weekly check-in day
        <select value={day??''} onChange={(event)=>void saveCadence(Number(event.target.value))} className="field mt-2">
          <option value="" disabled>Choose a day</option>{DAYS.map((label,index)=><option value={index} key={label}>{label}</option>)}
        </select></label>
      {cadenceSaved&&<p role="status" className="mt-3 text-sm text-[#176c54]">Got it. I’ll only check in when there’s something worth reviewing.</p>}
      {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
    {/* The cadence write changes prerequisite state. Use a document navigation so
        the proxy evaluates the newly persisted preference instead of a prefetched response. */}
    {cadenceSaved?<a href="/home" className="btn btn-primary">Go to Home</a>
      :<p className="text-sm text-[#59665f]">Choose a check-in day before heading Home.</p>}
  </div>
}
