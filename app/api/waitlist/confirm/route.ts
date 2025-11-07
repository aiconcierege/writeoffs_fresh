// app/api/waitlist/confirm/route.ts
import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

type WaitlistBody = {
  email: string
  name?: string
  source?: string
}

export async function POST(req: NextRequest) {
  try {
    const { email, name, source }: WaitlistBody = await req.json()

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Missing email" }, { status: 400 })
    }

    // Build SSR client that can read/write auth cookies in a route handler
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

    const { error } = await supabase.from("waitlist").insert({
      email,
      name: name ?? null,
      source: (source ?? "landing#waitlist").slice(0, 100),
    })

    if (error) {
      console.error("Supabase insert error:", error.message)
      return NextResponse.json({ error: "Unable to save waitlist" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Waitlist API error:", err)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
}
