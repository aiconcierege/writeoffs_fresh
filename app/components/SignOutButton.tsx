/* File: app/components/SignOutButton.tsx
 * Version: v2
 * Notes: Styled button to sign out and return to home.
 */
"use client"

import { useRouter } from "next/navigation"
import { supabase } from "../../utils/supabase/client"
import { useState } from "react"
import { cn } from "../lib/utils" // ← relative path (app/components → app/lib)

export default function SignOutButton({
  className = "",
}: {
  className?: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    setLoading(true)
    try {
      await supabase.auth.signOut()
    } catch {
      /* no-op */
    }
    router.push("/")
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className={cn(
        "btn btn-secondary rounded-xl border px-4 py-2 text-sm",
        "disabled:opacity-70 disabled:cursor-not-allowed",
        className
      )}
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  )
}
