'use client'

import Link from 'next/link'
import { useState } from 'react'
import { supabase } from '../../utils/supabase/client'

export default function RecoverAccountPage() {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false)
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true)
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` })
    setBusy(false); setSent(true)
  }
  return <main className="min-h-screen bg-[#fbfaf7]"><section className="mx-auto max-w-md px-6 py-20"><p className="eyebrow">Account recovery</p><h1 className="page-title">Reset your password</h1>
    <p className="page-description">Enter your email and we’ll send a secure password-reset link if the account exists.</p>
    {sent ? <div role="status" className="notice notice-success mt-8">Check your email for the next step. The link expires for your protection.</div>
      : <form onSubmit={submit} className="mt-8"><label htmlFor="recovery-email" className="form-field">Email<input id="recovery-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="field" /></label><button disabled={busy} className="btn btn-primary mt-5 w-full">{busy ? 'Sending…' : 'Send reset link'}</button></form>}
    <Link href="/login" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">Back to login</Link>
  </section></main>
}
