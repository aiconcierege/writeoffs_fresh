// app/api/reports/summary/route.ts
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

// ── CONFIGURATION ───────────────────────────────────────────────
const TABLE = "transactions"
const COL_USER = "user_id"
const COL_AMOUNT = "amount"
const COL_CATEGORY = "category_key"
const COL_DATE = "date"
// ────────────────────────────────────────────────────────────────

type SummaryTransaction = {
  amount: number | string | null
  category_key: string | null
  date: string | null
}

export async function GET() {
  // 👇 cookies() must be awaited in route handlers (Next 15)
  const cookieStore = await cookies()

  // Build Supabase client that reads + refreshes cookies
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
    console.error("Auth error:", userErr)
    return NextResponse.json({ error: "Auth error" }, { status: 401 })
  }

  try {
    const now = new Date()
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const firstOfWindow = new Date(now.getFullYear(), now.getMonth() - 11, 1) // 12-month window

    // Pull all transactions for this user in the last 12 months
    const { data: txns, error } = await supabase
      .from(TABLE)
      .select(`${COL_AMOUNT}, ${COL_CATEGORY}, ${COL_DATE}`)
      .eq(COL_USER, user.id)
      .gte(COL_DATE, firstOfWindow.toISOString())
      .lte(COL_DATE, now.toISOString())

    if (error) throw error

    let totalWindow = 0
    let thisMonthAbs = 0
    let lastMonthAbs = 0
    let categorizedCount = 0
    let uncategorizedCount = 0
    const categoryMap: Record<string, number> = {}

    for (const t of (txns ?? []) as SummaryTransaction[]) {
      const amt = Number(t.amount) || 0
      const d = new Date(t.date ?? 0)
      const cat = t.category_key ?? null

      totalWindow += amt

      // MoM comparison buckets
      if (d >= firstOfThisMonth) {
        thisMonthAbs += Math.abs(amt)
      } else if (d >= firstOfLastMonth && d < firstOfThisMonth) {
        lastMonthAbs += Math.abs(amt)
      }

      if (cat && cat.trim()) {
        categorizedCount++
        categoryMap[cat] = (categoryMap[cat] ?? 0) + amt
      } else {
        uncategorizedCount++
      }
    }

    const totalExpenses = Math.abs(totalWindow)
    const monthChange =
      lastMonthAbs === 0 ? 0 : ((thisMonthAbs - lastMonthAbs) / lastMonthAbs) * 100

    const categoryTotals = Object.entries(categoryMap)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))

    return NextResponse.json({
      totalExpenses,
      categorizedCount,
      uncategorizedCount,
      monthChange,
      categoryTotals,
    })
  } catch (e) {
    console.error("Summary route error:", e)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
