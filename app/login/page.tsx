/* File: app/login/page.tsx
 * Version: v3
 * Date: 2025-10-15
 * Notes: Wraps the client component using useSearchParams in <Suspense>.
 */
'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../utils/supabase/client'

function LoginInner() {
  const params = useSearchParams()
  const router = useRouter()
  const vertical = (params.get('vertical') === 'realtor' ? 'realtor' : 'general') as 'realtor' | 'general'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setErr(null); setOk(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setErr(error.message)
      setLoading(false)
      return
    }

    setOk('Signed in — redirecting…')
    setTimeout(() => router.push('/dashboard'), 150)
  }

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-md px-6 py-12">
        <div className="mb-2 inline-flex items-center rounded-full border px-3 py-1 text-sm">
          <span className="mr-2">🔑</span> Log in
        </div>
        <h1 className="text-3xl font-bold">Log in</h1>
        <p className="mt-2 text-sm text-neutral-700">
          Log in to continue to WriteOffs.
        </p>

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
              placeholder="Your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl btn btn-primary px-4 py-2 font-semibold disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Log in'}
          </button>
        </form>

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
        {ok && <p className="mt-3 text-sm text-green-700">{ok}</p>}

        <p className="mt-6 text-sm">
          New here?{' '}
          <Link href={`/signup?vertical=${vertical}`} className="underline">
            Create an account
          </Link>
        </p>
      </section>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-white"><section className="mx-auto max-w-md px-6 py-12">Loading…</section></main>}>
      <LoginInner />
    </Suspense>
  )
}
