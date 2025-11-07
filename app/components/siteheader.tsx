/* File: app/components/siteheader.tsx
 * Version: v3
 * Notes:
 * - Removes "For Realtors" nav item
 * - "Account" goes to /settings/profile
 * - Right-aligned, styled "Sign out" button
 * - Shows Log in / Sign up when not authenticated
 */
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../utils/supabase/client'

export default function SiteHeader() {
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    let ignore = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!ignore) setAuthed(Boolean(user))
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(Boolean(session?.user))
    })
    return () => {
      ignore = true
      sub.subscription.unsubscribe()
    }
  }, [])

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 text-base font-semibold">
          <img
            src="/logo-header.png"
            alt="WriteOffs.io"
            className="h-7 w-auto"
          />
          <span className="sr-only">WriteOffs.io</span>
        </Link>

        {/* Nav (center/left) */}
        <nav className="hidden items-center gap-4 md:flex">
          <Link href="/#features" className="text-sm">Features</Link>
          <Link href="/#pricing" className="text-sm">Pricing</Link>
          {/* Removed: For Realtors */}
          <Link href="/settings/profile" className="text-sm">Account</Link>
          <Link href="/dashboard" className="text-sm">Dashboard</Link>
        </nav>

        {/* Actions (right) */}
        <div className="ml-auto flex items-center gap-2">
          {!authed ? (
            <>
              <Link href="/login" className="rounded-xl border px-3 py-1.5 text-sm">
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-xl bg-black px-3 py-1.5 text-sm font-semibold text-white"
              >
                Sign up
              </Link>
            </>
          ) : (
            <button
              onClick={async () => {
                await supabase.auth.signOut()
                window.location.href = '/'
              }}
              className="rounded-xl bg-black px-3 py-1.5 text-sm font-semibold text-white"
              title="Sign out"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
