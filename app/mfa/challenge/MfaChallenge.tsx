'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../utils/supabase/client'
import { safeAuthenticatedNext } from '../../lib/auth/mfa-policy'

export function MfaChallenge({ next }: { next?: string }) {
  const router = useRouter()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void supabase.auth.mfa.listFactors().then(({ data }) => {
    const factor = data?.totp.find((item) => item.status === 'verified')
    setFactorId(factor?.id ?? null)
  }) }, [])

  async function verify(event: React.FormEvent) {
    event.preventDefault(); setError(null)
    if (!factorId) { setError('No authenticator app is available for this account.'); return }
    setBusy(true)
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    setBusy(false)
    if (verifyError) { setError('That code didn’t work. Try again.'); return }
    router.replace(safeAuthenticatedNext(next)); router.refresh()
  }

  return <main className="app-page"><div className="page-container page-container-narrow">
    <section className="mx-auto max-w-md"><p className="eyebrow">Account security</p><h1 className="page-title">Enter your security code</h1>
      <p className="page-description">Open your authenticator app and enter the 6-digit code for WriteOffs.</p>
      <form onSubmit={verify} className="surface mt-8 p-5 sm:p-7"><label htmlFor="mfa-code" className="form-field">6-digit code
        <input id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="field text-center text-2xl tracking-[.25em]" /></label>
        {error && <p role="alert" className="notice notice-error mt-4">{error}</p>}
        <button disabled={busy || code.length !== 6} className="btn btn-primary mt-5 w-full">{busy ? 'Checking…' : 'Continue'}</button>
      </form>
      {!factorId && <p className="mt-5 text-center text-sm text-[#59665f]">Lost access to your authenticator? <Link href="/settings/security" className="font-semibold text-[#243186]">Review recovery options</Link></p>}
    </section>
  </div></main>
}
