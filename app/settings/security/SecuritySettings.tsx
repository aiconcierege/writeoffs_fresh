'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../utils/supabase/client'
import { startTotpEnrollment, type TotpEnrollment } from '../../lib/auth/totp-enrollment'
import { MFA_SECURITY_API_PATH, SECURITY_SETTINGS_PATH } from '../../lib/auth/mfa-policy'

export function SecuritySettings({ enrollmentRequired, next }: { enrollmentRequired: boolean; next: string }) {
  const router = useRouter()
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null)
  const [assured, setAssured] = useState(false)
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const [{ data: factors }, { data: assurance }] = await Promise.all([
      supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
    setVerifiedFactorId(factors?.totp.find((factor) => factor.status === 'verified')?.id ?? null)
    setAssured(assurance?.currentLevel === 'aal2')
  }
  useEffect(() => { void refresh() }, [])

  async function beginEnrollment() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      setEnrollment(await startTotpEnrollment(supabase.auth.mfa))
    } catch {
      setError('We couldn’t start two-factor authentication. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function verifyEnrollment(event: React.FormEvent) {
    event.preventDefault(); if (!enrollment) return
    setBusy(true); setError(null)
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code })
    setBusy(false)
    if (verifyError) { setError('That code didn’t work. Try again.'); return }
    setEnrollment(null); setCode(''); setMessage('Two-factor authentication is on.'); await refresh()
    if (enrollmentRequired) router.replace(next)
    else router.refresh()
  }

  async function removeFactor() {
    if (!verifiedFactorId) return
    setBusy(true); setError(null); setMessage(null)
    const response = await fetch(MFA_SECURITY_API_PATH, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ factorId: verifiedFactorId }) })
    setBusy(false)
    if (!response.ok) { setError(response.status === 403 ? 'Enter a fresh authenticator code before removing two-factor authentication.' : 'We couldn’t update your security settings.'); return }
    setMessage('Two-factor authentication was removed.'); await refresh(); router.refresh()
  }

  return <main className="app-page"><div className="page-container page-container-narrow">
    <p className="eyebrow">Account</p><h1 className="page-title">Security</h1><p className="page-description">Protect your financial records with an authenticator app.</p>
    {enrollmentRequired && !verifiedFactorId && <p className="notice mt-7">Set up two-factor authentication before continuing to WriteOffs.</p>}
    <section className="section-rule mt-9" aria-labelledby="two-factor-heading"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 id="two-factor-heading" className="section-heading">Two-factor authentication</h2>
      <p className="section-description">{verifiedFactorId ? 'Your account is protected with an authenticator app.' : 'Add a second step when signing in.'}</p></div><span className="status-badge" data-tone={verifiedFactorId ? 'positive' : 'attention'}>{verifiedFactorId ? 'On' : 'Not set up'}</span></div>
      {!verifiedFactorId && !enrollment && <form action={SECURITY_SETTINGS_PATH} method="get" onSubmit={(event) => { event.preventDefault(); void beginEnrollment() }}><button type="submit" disabled={busy} aria-busy={busy} className="btn btn-primary mt-6">{busy ? 'Starting…' : 'Set up authenticator app'}</button></form>}
      {busy && !enrollment && <p role="status" aria-live="polite" className="mt-3 text-sm text-[#59665f]">Starting authenticator setup…</p>}
      {enrollment && <form onSubmit={verifyEnrollment} className="surface mt-6 p-5 sm:p-7"><h3 className="font-semibold text-[#17211d]">Scan the QR code</h3><p className="mt-2 text-sm leading-6 text-[#59665f]">Scan this with your authenticator app, then enter its 6-digit code.</p>
        {/* This validated Supabase SVG data URI is rendered as an image resource, never injected as markup. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enrollment.qrCode} width={192} height={192} alt="QR code for authenticator app setup" className="mx-auto mt-5 h-48 w-48" />
        <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold text-[#243186]">Can’t scan the code?</summary><p className="mt-2 break-all rounded-lg bg-[#f0f5f1] p-3 font-mono text-xs" aria-label="Authenticator setup key">{enrollment.secret}</p></details>
        <label htmlFor="enrollment-code" className="form-field mt-5">Enter the 6-digit code<input id="enrollment-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="field text-center text-xl tracking-[.2em]" /></label>
        <button disabled={busy || code.length !== 6} className="btn btn-primary mt-5 w-full sm:w-auto">{busy ? 'Checking…' : 'Turn on two-factor authentication'}</button></form>}
      {verifiedFactorId && <div className="mt-6"><p className="text-sm leading-6 text-[#59665f]">Removing this protection requires a session verified with your authenticator app.</p><button disabled={busy || !assured} onClick={() => void removeFactor()} className="btn btn-danger mt-3">Remove two-factor authentication</button>{!assured && <a href="/mfa/challenge?next=/settings/security" className="ml-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">Verify security code</a>}</div>}
      {error && <p role="alert" className="notice notice-error mt-5">{error}</p>}{message && <p role="status" className="notice notice-success mt-5">{message}</p>}
    </section>
    <section className="section-rule mt-10"><h2 className="section-heading">Recovery</h2><p className="section-description">Keep access to your authenticator app. WriteOffs does not store backup codes or provide an automatic MFA bypass. If access is lost, account recovery requires a verified support process.</p></section>
  </div></main>
}
