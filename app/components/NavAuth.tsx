/* File: app/components/NavAuth.tsx
 * Version: v1
 * Date: 2025-10-13
 * Notes: Shows Account/Sign out when logged in; Join Waitlist when logged out.
 */
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../utils/supabase/client'

export default function NavAuth() {
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!ignore) setEmail(user?.email ?? null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null)
    })
    return () => { ignore = true; sub.subscription.unsubscribe() }
  }, [])

  if (email) {
    return (
      <div className="flex items-center gap-3">
        <Link href="/settings" className="text-sm">Account</Link>
        <Link href="/dashboard" className="text-sm">Dashboard</Link>
        <Link
          href="/"
          onClick={async (e) => {
            e.preventDefault()
            await supabase.auth.signOut().catch(() => {})
            window.location.href = '/'
          }}
          className="rounded-xl border px-3 py-2 text-sm"
        >
          Sign out
        </Link>
      </div>
    )
  }

  return (
    <a href="#waitlist" className="rounded-xl bg-[#243186] px-3 py-2 text-sm font-semibold text-white">
      Join Waitlist
    </a>
  )
}
