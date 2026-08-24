'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../utils/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter(); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) { setBusy(false); setError('This reset link is invalid or expired. Request a new one.'); return }
    await supabase.auth.signOut(); router.replace('/login'); router.refresh()
  }
  return <main className="app-page"><section className="page-container page-container-narrow"><div className="mx-auto max-w-md"><p className="eyebrow">Account recovery</p><h1 className="page-title">Choose a new password</h1><p className="page-description">After changing it, sign in again. Two-factor authentication remains required when enabled.</p>
    <form onSubmit={submit} className="surface mt-8 p-5 sm:p-7"><label htmlFor="new-password" className="form-field">New password<input id="new-password" type="password" required minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="field" /></label>{error && <p role="alert" className="notice notice-error mt-4">{error}</p>}<button disabled={busy} className="btn btn-primary mt-5 w-full">{busy ? 'Saving…' : 'Save new password'}</button></form>
  </div></section></main>
}
