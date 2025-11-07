// app/lib/supabaseServer.ts
// Safe server-side Supabase helpers for the App Router (Next 15+).
// - Uses @supabase/ssr
// - Awaits cookies() inside the function
// - No top-level client creation

import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Return a Supabase client bound to the **current request** (reads/writes auth cookies).
 * Call this **inside** a route handler or server action.
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const SUPABASE_ANON_KEY =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing SUPABASE env vars: set SUPABASE_URL and SUPABASE_ANON_KEY")
  }

  // Next 15: cookies() must be awaited in route handlers
  const cookieStore = await cookies()

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get: (name: string) => cookieStore.get(name)?.value,
      set: (name: string, value: string, options: any) => {
        cookieStore.set({ name, value, ...options })
      },
      remove: (name: string, options: any) => {
        cookieStore.set({ name, value: "", ...options, maxAge: 0 })
      },
    },
  })
}

/**
 * Optional: get a plain, unauthenticated client (never touches cookies).
 * Useful for public data or admin-style service calls where you manage auth separately.
 */
export function supabaseAnon(): SupabaseClient {
  const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const SUPABASE_ANON_KEY =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing SUPABASE env vars: set SUPABASE_URL and SUPABASE_ANON_KEY")
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
}

// ⚠️ Do NOT export a top-level client like `export const supabase = await supabaseServer()`
// That would call cookies() outside a request context and crash.
export default supabaseServer
