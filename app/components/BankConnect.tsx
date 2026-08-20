'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from 'react-plaid-link'

type Connection = {
  id: string
  institution_name: string | null
  connection_status: string
  last_successful_sync_at: string | null
}

function connectionLabel(status: string) {
  if (status === 'connected') return 'Connected'
  if (status === 'updating') return 'Updating transactions…'
  if (status === 'reconnect_required') return 'Reconnect required'
  if (status === 'disconnected') return 'Disconnected'
  return 'Needs attention'
}

export default function BankConnect(input: {
  enabled: boolean
  connections: Connection[]
  accounts: Array<{ item_record_id: string; id: string; display_name: string; mask_last_four: string | null; connection_status: string }>
}) {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [modeItemId, setModeItemId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const exchangeRequest = useRef<string | null>(null)

  const onSuccess = useCallback(async (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
    setBusy(true); setMessage('Updating transactions…')
    try {
      if (!modeItemId) {
        if (!publicToken) throw new Error('The bank connection did not return a usable token.')
        exchangeRequest.current ??= crypto.randomUUID()
        const response = await fetch('/api/plaid/exchange', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicToken, requestId: exchangeRequest.current,
            institution: metadata.institution ? { id: metadata.institution.institution_id, name: metadata.institution.name } : null,
          }),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.message || 'We couldn’t finish connecting this account.')
        setMessage(body.sync?.pending || body.sync?.status === 'updating'
          ? 'Connected. Transactions are still updating…' : 'You’re up to date ✓')
      } else {
        const response = await fetch('/api/plaid/sync', { method: 'POST' })
        if (!response.ok) throw new Error('The account was reconnected, but its update is still pending.')
      }
      exchangeRequest.current = null
      if (modeItemId) setMessage('You’re up to date ✓')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The account could not be connected.')
    } finally { setBusy(false); setToken(null); setModeItemId(null) }
  }, [modeItemId, router])
  const { open, ready, error: linkError } = usePlaidLink({ token, onSuccess })
  useEffect(() => { if (token && ready) open() }, [token, ready, open])
  useEffect(() => { if (linkError) setMessage('Secure bank connection could not open.') }, [linkError])

  async function start(itemId?: string) {
    setBusy(true); setMessage(itemId ? 'Preparing reconnection…' : 'Preparing secure connection…')
    setModeItemId(itemId ?? null)
    try {
      const response = await fetch('/api/plaid/link-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: itemId ?? null }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'Bank connection setup is unavailable right now.')
      setToken(body.linkToken); setMessage('Opening secure connection…')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bank connection setup is unavailable right now.')
      setModeItemId(null)
    } finally { setBusy(false) }
  }

  async function updateAccounts() {
    setBusy(true); setMessage('Updating…')
    try {
      const response = await fetch('/api/plaid/sync', { method: 'POST' })
      if (!response.ok) throw new Error('Accounts could not be updated right now.')
      const body = await response.json().catch(() => ({}))
      const updating = Array.isArray(body.results) && body.results.some((result: { status?: string }) => result.status === 'updating')
      setMessage(updating ? 'Transactions are still updating…' : 'You’re up to date ✓'); router.refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Accounts could not be updated.') }
    finally { setBusy(false) }
  }

  async function disconnect(itemId: string) {
    if (!window.confirm('Disconnect this institution? Your existing bookkeeping history will be preserved.')) return
    setBusy(true); setMessage('Disconnecting…')
    try {
      const response = await fetch('/api/plaid/disconnect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId }),
      })
      if (!response.ok) throw new Error('This connection could not be disconnected.')
      setMessage('Connection disconnected. Historical activity was preserved.'); router.refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'This connection could not be disconnected.') }
    finally { setBusy(false) }
  }

  if (!input.enabled) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Plaid Sandbox is not configured in this environment. CSV import and receipt upload remain available.</div>
  return <div className="space-y-5">
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><strong>Sandbox testing only.</strong> Use Plaid Sandbox institutions and test credentials—never real bank credentials.</div>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy} onClick={() => void start()} className="btn btn-primary min-h-11 disabled:opacity-60">Connect an account</button>
      {input.connections.some((item) => item.connection_status !== 'disconnected') && <button type="button" disabled={busy} onClick={() => void updateAccounts()} className="btn btn-secondary min-h-11 disabled:opacity-60">Update accounts</button>}
    </div>
    {message && <p role="status" aria-live="polite" className="text-sm text-slate-700">{message}</p>}
    <ul className="space-y-3">
      {input.connections.map((connection) => {
        const accounts = input.accounts.filter((account) => account.item_record_id === connection.id)
        return <li key={connection.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-950">{connection.institution_name || 'Connected institution'}</h2><p className="mt-1 text-sm text-slate-600">{connectionLabel(connection.connection_status)}</p>{connection.last_successful_sync_at && <p className="mt-1 text-xs text-slate-500">Last updated {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(connection.last_successful_sync_at))}</p>}</div><div className="flex gap-2">{['reconnect_required', 'needs_attention'].includes(connection.connection_status) && <button type="button" disabled={busy} onClick={() => void start(connection.id)} className="btn btn-secondary min-h-11">Reconnect account</button>}{connection.connection_status !== 'disconnected' && <button type="button" disabled={busy} onClick={() => void disconnect(connection.id)} className="min-h-11 rounded-md px-3 text-sm font-semibold text-red-700 hover:bg-red-50">Disconnect</button>}</div></div>
          {accounts.length > 0 && <ul className="mt-3 space-y-1 text-sm text-slate-600">{accounts.map((account) => <li key={account.id}>{account.display_name}{account.mask_last_four ? ` •••• ${account.mask_last_four}` : ''}{account.connection_status !== 'active' ? ' — Needs attention' : ''}</li>)}</ul>}
        </li>
      })}
    </ul>
  </div>
}
