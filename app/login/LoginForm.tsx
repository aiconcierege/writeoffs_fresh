'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../utils/supabase/client'

export function LoginForm({ signupEnabled }: { signupEnabled: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true); setErr(null); setOk(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setErr('Email or password wasn’t recognized. Try again.')
      setLoading(false)
      return
    }
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    setOk('Signed in — redirecting…')
    setTimeout(() => router.push(assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2'
      ? '/mfa/challenge?next=/home' : '/home'), 150)
  }

  return <>
    <form onSubmit={handleLogin} className="mt-7 space-y-5" aria-busy={loading}>
      <div>
        <label htmlFor="login-email" className="text-sm font-semibold text-[#29372f]">Email address</label>
        <input id="login-email" type="email" required autoComplete="email" value={email}
          onChange={event => setEmail(event.target.value)} disabled={loading}
          className="mt-2 min-h-12 w-full rounded-xl border border-[#c9d4cd] bg-white px-4 text-base text-[#17211d] outline-none transition focus-visible:border-[#243186] focus-visible:ring-2 focus-visible:ring-[#243186]/20 disabled:opacity-70"
          placeholder="you@example.com"/>
      </div>
      <div>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="login-password" className="text-sm font-semibold text-[#29372f]">Password</label>
          <Link href="/recover" className="text-sm font-semibold text-[#243186] underline decoration-[#a9b1dc] underline-offset-4">Forgot password?</Link>
        </div>
        <input id="login-password" type="password" required minLength={8} autoComplete="current-password"
          value={password} onChange={event => setPassword(event.target.value)} disabled={loading}
          className="mt-2 min-h-12 w-full rounded-xl border border-[#c9d4cd] bg-white px-4 text-base text-[#17211d] outline-none transition focus-visible:border-[#243186] focus-visible:ring-2 focus-visible:ring-[#243186]/20 disabled:opacity-70"
          placeholder="Your password"/>
      </div>
      <button type="submit" disabled={loading}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#243186] px-5 font-semibold text-white shadow-[0_10px_24px_rgba(36,49,134,.18)] transition hover:bg-[#1d2870] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#243186] disabled:cursor-not-allowed disabled:opacity-60">
        {loading ? 'Signing in…' : 'Log in'}
      </button>
    </form>
    {err && <p role="alert" className="mt-4 text-sm text-red-700">{err}</p>}
    {ok && <p role="status" aria-live="polite" className="mt-4 text-sm text-green-700">{ok}</p>}
    <p className="mt-7 border-t border-[#dce3de] pt-6 text-sm text-[#59665f]">
      {signupEnabled ? <>New here? <Link href="/signup" className="font-semibold text-[#243186] underline decoration-[#a9b1dc] underline-offset-4">Create an account</Link></>
        : <>Don’t have an account yet? <Link href="/#waitlist" className="font-semibold text-[#243186] underline decoration-[#a9b1dc] underline-offset-4">Join the waitlist →</Link></>}
    </p>
  </>
}
