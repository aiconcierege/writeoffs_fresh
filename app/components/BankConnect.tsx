'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { usePlaidLink, type PlaidLinkOnExit, type PlaidLinkOnSuccessMetadata } from 'react-plaid-link'

type Connection = {
  id: string
  institution_name: string | null
  connection_status: string
  last_successful_sync_at: string | null
}

type AccountUseDesignation = 'business_only' | 'business_and_personal'
type AccountUse = {
  id: string
  financial_account_id: string
  designation: AccountUseDesignation
  effective_at: string
}

const ACCOUNT_USE_LABELS: Record<AccountUseDesignation, string> = {
  business_only: 'Business only',
  business_and_personal: 'Business and personal',
}

const OAUTH_LINK_TOKEN_KEY = 'writeoffs:plaid-oauth-link-token'
const OAUTH_MODE_ITEM_KEY = 'writeoffs:plaid-oauth-mode-item'
const OAUTH_RETURN_PATH_KEY = 'writeoffs:plaid-oauth-return-path'

function clearOAuthResumeState() {
  sessionStorage.removeItem(OAUTH_LINK_TOKEN_KEY)
  sessionStorage.removeItem(OAUTH_MODE_ITEM_KEY)
  sessionStorage.removeItem(OAUTH_RETURN_PATH_KEY)
}

function connectionLabel(status: string) {
  if (status === 'connected') return 'Connected'
  if (status === 'updating') return 'Updating transactions…'
  if (status === 'reconnect_required') return 'Reconnect required'
  if (status === 'disconnected') return 'Disconnected'
  return 'Needs attention'
}

const subscribeToTimeZone = () => () => {}
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
const serverTimeZone = () => 'UTC'

export default function BankConnect(input: {
  enabled: boolean
  sandbox: boolean
  connections: Connection[]
  accounts: Array<{ item_record_id: string; id: string; display_name: string; mask_last_four: string | null; connection_status: string }>
  accountUses: AccountUse[]
}) {
  // Match the server during hydration, then display the customer's local time.
  const displayTimeZone = useSyncExternalStore(subscribeToTimeZone, browserTimeZone, serverTimeZone)
  const router = useRouter()
  const pathname = usePathname()
  const [token, setToken] = useState<string | null>(null)
  const [modeItemId, setModeItemId] = useState<string | null>(null)
  const [receivedRedirectUri, setReceivedRedirectUri] = useState<string | undefined>()
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [accountUseById, setAccountUseById] = useState<Record<string, AccountUseDesignation>>(() =>
    Object.fromEntries(input.accountUses.map((use) => [use.financial_account_id, use.designation])),
  )
  const [accountUseState, setAccountUseState] = useState<Record<string,
    { saving: boolean; message: string | null; error: string | null }>>({})
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
      const returnPath = sessionStorage.getItem(OAUTH_RETURN_PATH_KEY)
      clearOAuthResumeState()
      if (returnPath && returnPath.startsWith('/') && !returnPath.startsWith('//')) router.replace(returnPath)
      else router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The account could not be connected.')
    } finally { setBusy(false); setToken(null); setModeItemId(null); setReceivedRedirectUri(undefined) }
  }, [modeItemId, router])
  const onExit = useCallback<PlaidLinkOnExit>(() => {
    clearOAuthResumeState()
    setToken(null)
    setModeItemId(null)
    setReceivedRedirectUri(undefined)
  }, [])
  const { open, ready, error: linkError } = usePlaidLink({ token, onSuccess, onExit, receivedRedirectUri })
  useEffect(() => { if (token && ready) open() }, [token, ready, open])
  useEffect(() => { if (linkError) setMessage('Secure bank connection could not open.') }, [linkError])
  useEffect(() => {
    setAccountUseById(Object.fromEntries(
      input.accountUses.map((use) => [use.financial_account_id, use.designation]),
    ))
  }, [input.accountUses])
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('oauth_state_id')) return
    const resumedToken = sessionStorage.getItem(OAUTH_LINK_TOKEN_KEY)
    if (!resumedToken) {
      setMessage('Your bank sent you back, but the secure connection expired. Please connect again.')
      window.history.replaceState({}, '', pathname)
      return
    }
    setModeItemId(sessionStorage.getItem(OAUTH_MODE_ITEM_KEY) || null)
    setReceivedRedirectUri(url.href)
    setToken(resumedToken)
    setMessage('Finishing your secure connection…')
  }, [pathname])

  async function saveAccountUse(accountId: string, designation: AccountUseDesignation) {
    if (accountUseById[accountId] === designation || accountUseState[accountId]?.saving) return
    setAccountUseState((current) => ({ ...current,
      [accountId]: { saving: true, message: 'Saving…', error: null },
    }))
    try {
      const response = await fetch(`/api/bookkeeping/accounts/${accountId}/use`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ designation, effectiveAt: new Date().toISOString(), requestId: crypto.randomUUID() }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'This account choice could not be saved.')
      setAccountUseById((current) => ({ ...current, [accountId]: designation }))
      setAccountUseState((current) => ({ ...current,
        [accountId]: { saving: false, message: 'Saved.', error: null },
      }))
      router.refresh()
    } catch (error) {
      setAccountUseState((current) => ({ ...current, [accountId]: { saving: false, message: null,
        error: error instanceof Error ? error.message : 'This account choice could not be saved.' },
      }))
    }
  }

  async function start(itemId?: string) {
    if (receivedRedirectUri) window.history.replaceState({}, '', pathname)
    setBusy(true); setMessage(itemId ? 'Preparing reconnection…' : 'Preparing secure connection…')
    setModeItemId(itemId ?? null)
    try {
      const response = await fetch('/api/plaid/link-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: itemId ?? null }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'Bank connection setup is unavailable right now.')
      sessionStorage.setItem(OAUTH_LINK_TOKEN_KEY, body.linkToken)
      sessionStorage.setItem(OAUTH_RETURN_PATH_KEY, pathname)
      if (itemId) sessionStorage.setItem(OAUTH_MODE_ITEM_KEY, itemId)
      else sessionStorage.removeItem(OAUTH_MODE_ITEM_KEY)
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

  const connectionControls=<div className="space-y-5">{input.enabled
      ? <>{input.sandbox && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><strong>Sandbox testing only.</strong> Use Plaid Sandbox institutions and test credentials—never real bank credentials.</div>}
        <p className="text-sm leading-6 text-slate-600">WriteOffs uses Plaid to securely connect your account and retrieve account and transaction information for your bookkeeping. Review the <a className="font-semibold underline underline-offset-2" href="/legal/privacy" target="_blank" rel="noreferrer">WriteOffs Privacy Policy</a> and <a className="font-semibold underline underline-offset-2" href="https://plaid.com/legal/#end-user-privacy-policy" target="_blank" rel="noreferrer">Plaid End User Privacy Policy</a>.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={() => void start()} className="btn btn-primary min-h-11 disabled:opacity-60">Connect my accounts</button>
          {input.connections.some((item) => item.connection_status !== 'disconnected') && <button type="button" disabled={busy} onClick={() => void updateAccounts()} className="btn btn-secondary min-h-11 disabled:opacity-60">Update accounts</button>}
        </div></>
      : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">New bank connections are not available in this environment. You can still choose how you use accounts already connected.</div>}</div>

  return <div className="space-y-5">
    {input.accounts.length===0&&connectionControls}
    {message && <p role="status" aria-live="polite" className="text-sm text-slate-700">{message}</p>}
    {input.accounts.length>0&&<div className="sticky top-16 z-10 border-b border-[#dce3de] bg-[#fbfaf7]/95 py-4 backdrop-blur"><h2 className="text-xl font-semibold">Tell Betti how you use these accounts</h2><p className="mt-2 text-sm leading-6 text-[#59665f]">This helps me know which purchases belong in your books.</p><p className="mt-2 text-sm leading-6">For each account, choose whether you use it only for business or for business and personal spending.</p><p className="mt-2 text-sm font-semibold" role="status">{input.accounts.filter(a=>a.connection_status==='active'&&!accountUseById[a.id]).length} accounts still need a choice</p></div>}
    <ul className="space-y-8">
      {input.connections.map((connection) => {
        const accounts = input.accounts.filter((account) => account.item_record_id === connection.id)
        return <li key={connection.id} className="border-t border-[#dce3de] py-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-950">{connection.institution_name || 'Connected institution'}</h2><p className="mt-1 text-sm text-slate-600">{connectionLabel(connection.connection_status)}</p>{connection.last_successful_sync_at && <p className="mt-1 text-xs text-slate-500">Last updated {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: displayTimeZone }).format(new Date(connection.last_successful_sync_at))}</p>}</div>{input.enabled && <div className="flex gap-2">{['reconnect_required', 'needs_attention'].includes(connection.connection_status) && <button type="button" disabled={busy} onClick={() => void start(connection.id)} className="btn btn-secondary min-h-11">Reconnect account</button>}{connection.connection_status !== 'disconnected' && <button type="button" disabled={busy} onClick={() => void disconnect(connection.id)} className="min-h-11 rounded-md px-3 text-sm font-semibold text-red-700 hover:bg-red-50">Disconnect</button>}</div>}</div>
          {accounts.length > 0 && <ul className="mt-4 space-y-3">{accounts.map((account) => {
            const selected = accountUseById[account.id]
            const state = accountUseState[account.id]
            return <li key={account.id} className="border-b border-[#e1e6e2] py-5">
              <div className="text-sm"><strong className="text-slate-950">{account.display_name}</strong>
                <span className="text-slate-600">{account.mask_last_four ? ` •••• ${account.mask_last_four}` : ''}
                  {account.connection_status !== 'active' ? ' — Needs attention' : ''}</span></div>
              <p className="mt-1 text-sm text-slate-600">Current choice: <strong className="text-slate-800">
                {selected ? ACCOUNT_USE_LABELS[selected] : 'Not chosen yet'}</strong></p>
              <fieldset className="mt-4" disabled={state?.saving}>
                <legend className="text-sm font-semibold text-slate-950">How do you use this account?</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">{(
                  Object.entries(ACCOUNT_USE_LABELS) as Array<[AccountUseDesignation, string]>
                ).map(([value, label]) => <label key={value}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                    selected === value ? 'border-[#243186] bg-[#f1f2fb] text-[#243186]' : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                  } ${state?.saving ? 'cursor-wait opacity-60' : ''}`}>
                  <input type="radio" name={`account-use-${account.id}`} value={value} checked={selected === value}
                    onChange={() => void saveAccountUse(account.id, value)} className="h-4 w-4 accent-[#243186]" />
                  <span>{label}</span>
                </label>)}</div>
              </fieldset>
              {state?.message && <p role="status" aria-live="polite" className="mt-2 text-sm text-[#176c54]">{state.message}</p>}
              {state?.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
            </li>
          })}</ul>}
        </li>
      })}
    </ul>
    {input.accounts.length>0&&connectionControls}
  </div>
}
