'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  accountCheckLabel, checkInDayLabel, type HomeOperatingStatus as Status,
} from '../lib/home/operating-status-model'

export function HomeOperatingStatus({ status }: { status: Status }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const checked = accountCheckLabel(status.lastSuccessfulAccountCheck, status.timeZone)
  const checkInDay = checkInDayLabel(status.checkInWeekday)

  async function checkForTransactions() {
    setBusy(true); setMessage('Checking connected accounts…')
    try {
      const response = await fetch('/api/plaid/sync', { method: 'POST' })
      if (!response.ok) throw new Error('I couldn’t check your accounts right now.')
      const body = await response.json().catch(() => ({}))
      const updating = Array.isArray(body.results)
        && body.results.some((result: { status?: string }) => result.status === 'updating')
      setMessage(updating ? 'New transactions are still being checked.' : 'Your connected accounts have been checked.')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'I couldn’t check your accounts right now.')
    } finally { setBusy(false) }
  }

  return <section className="home-operating" aria-label="Bookkeeping schedule">
    <div className="home-operating-facts">
      {status.hasConnectedAccounts&&<div><p>Accounts checked</p><strong>{checked??'First check in progress'}</strong></div>}
      <div><p>Next check-in</p><strong>{checkInDay ? `Every ${checkInDay}` : 'Choose your normal check-in day'}</strong>
      </div>
    </div>
    <div className="home-operating-action">
      {status.hasConnectedAccounts
        ? <button type="button" disabled={busy} onClick={()=>void checkForTransactions()} className="home-check-action">{busy ? 'Checking…' : 'Check for new transactions'} <span aria-hidden="true">↻</span></button>
        : <Link href="/get-started" className="home-check-action">Connect an account <span aria-hidden="true">→</span></Link>}
      {message && <p role="status" aria-live="polite">{message}</p>}
    </div>
  </section>
}
