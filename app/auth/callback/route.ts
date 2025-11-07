// app/auth/callback/route.ts
import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

export async function GET(req: NextRequest) {
  try {
    // Build SSR client that reads/writes auth cookies
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name: string) => cookieStore.get(name)?.value,
          set: (name: string, value: string, options: any) => {
            cookieStore.set({ name, value, ...options })
          },
          remove: (name: string, options: any) => {
            cookieStore.set({ name, value: "", ...options, maxAge: 0 })
          },
        },
      }
    )

    // Extract the code from the URL
    const { searchParams } = new URL(req.url)
    const code = searchParams.get("code")
    if (!code) {
      return NextResponse.redirect(new URL("/", req.url))
    }

    // Exchange the code for a session (sets cookies)
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error("Auth callback error:", error.message)
      return NextResponse.redirect(new URL("/login?error=auth", req.url))
    }

    // Success → send user to dashboard
    return NextResponse.redirect(new URL("/dashboard", req.url))
  } catch (e: any) {
    console.error("Auth callback exception:", e?.message || e)
    return NextResponse.redirect(new URL("/login?error=exception", req.url))
  }
}
