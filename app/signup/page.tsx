/* File: app/signup/page.tsx
 * Version: v5
 * Date: 2025-10-15
 * Notes: Universal signup path; business context is collected during onboarding.
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../utils/supabase/client'

function SignupInner() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setErr(null); setMsg(null)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      }
    })
    if (signUpError) { setErr('We couldn’t create that account. Check the details and try again.'); setLoading(false); return }

    setPassword('')
    if (!data.session) {
      setMsg(email.trim())
      setLoading(false)
      return
    }

    router.push('/onboarding')
  }

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-md px-6 py-12">
        {msg ? <div role="status" aria-live="polite" className="py-10">
          <p className="text-sm font-semibold text-[#243186]">Your next step</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Check your email</h1>
          <p className="mt-5 leading-7 text-neutral-700">We sent a confirmation link to <strong className="break-words">{msg}</strong>. Open it to continue setting up WriteOffs.</p>
          <p className="mt-5 text-sm leading-6 text-neutral-600">Don’t see it? Check your spam folder. If you already confirmed your email, <Link href="/login" className="font-semibold underline">log in to continue</Link>.</p>
        </div> : <>
        <div className="mb-2 inline-flex items-center rounded-full border px-3 py-1 text-sm">
          <span className="mr-2">🔐</span> Create your account
        </div>
        <h1 className="text-3xl font-bold">Sign up</h1>
        <p className="mt-2 text-sm text-neutral-700">Set up your business and start organizing your activity.</p>

        <form onSubmit={handleSignup} className="mt-6 space-y-4">
          <div>
            <label htmlFor="signup-email" className="block text-sm font-medium">Email</label>
            <input
              id="signup-email"
              autoComplete="email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="signup-password" className="block text-sm font-medium">Password</label>
            <input
              id="signup-password"
              autoComplete="new-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
              placeholder="At least 8 characters"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl btn btn-primary px-4 py-2 font-semibold disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        {err && <p role="alert" className="mt-3 text-sm text-red-600">{err}</p>}


        <p className="mt-6 text-sm">
          Already have an account?{' '}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </p>

        </>}

        <p className="mt-10 text-xs text-neutral-600">
          By continuing you agree to our <Link href="/legal/terms" className="underline">Terms</Link> and{' '}
          <Link href="/legal/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </section>
    </main>
  )
}

export default function SignupPage() {
  return <SignupInner />
}
