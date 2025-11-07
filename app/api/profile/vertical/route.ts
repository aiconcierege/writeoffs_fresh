// app/api/profile/vertical/route.ts
import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

export async function POST(req: NextRequest) {
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

  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user) {
    return NextResponse.json({ error: "Auth error" }, { status: 401 })
  }

  try {
    const { vertical } = await req.json()
    if (!vertical || typeof vertical !== "string") {
      return NextResponse.json({ error: "Missing 'vertical'." }, { status: 400 })
    }

    // Update the user's profile vertical
    const { error } = await supabase
      .from("profiles")
      .update({ vertical })
      .eq("id", user.id)

    if (error) throw error

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 })
  }
}
