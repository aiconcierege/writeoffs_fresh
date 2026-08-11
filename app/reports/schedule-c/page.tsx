/* File: app/reports/schedule-c/page.tsx
 * Version: v3 (null-safe + typed helpers)
 * Date: 2025-11-07
 * Notes:
 *  - Normalizes Supabase `data` to `safeData` to avoid null errors
 *  - Shows transaction count using `txnCount` (from safeData)
 */
import { redirect } from "next/navigation"
import { createServerSupabase } from "../../../utils/supabase/server"
import type { ReactNode } from "react"

type Row = {
  category_key: string | null
  label: string | null
  total_amount: number
  count: number
  with_receipt: number
}

export default async function ScheduleCSummary({
  searchParams,
}: {
  // Next 15: searchParams is async
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // 🔧 await searchParams
  const sp = await searchParams
  const packRaw = Array.isArray(sp.pack) ? sp.pack[0] : sp.pack
  const pack = packRaw === "general" || packRaw === "realtor" ? packRaw : undefined

  // Fetch transactions with nested receipts(count)
  let query = supabase
    .from("transactions")
    .select("amount, category_key, categories(label), receipts:receipts!receipts_transaction_id_fkey(count)")
    .order("date", { ascending: true })
    .limit(50000)

  if (pack) query = query.eq("pack", pack)

  const { data, error } = await query

  if (error) {
    return (
      <main className="min-h-screen bg-white">
        <section className="mx-auto max-w-4xl px-6 py-10">
          <h1 className="text-3xl font-bold">Schedule C summary</h1>
          <p className="mt-3 text-sm text-red-700">Error: {error.message}</p>
        </section>
      </main>
    )
  }

  // ✅ Null-safe data
  const safeData = Array.isArray(data) ? (data as any[]) : []
  const txnCount = safeData.length

  // Aggregate
  const totals = new Map<
    string,
    { label: string; total: number; count: number; withReceipt: number }
  >()
  let grand = 0

  for (const r of safeData) {
    const key = r.category_key ?? "uncategorized"
    const label = r.categories?.label ?? (r.category_key ?? "Uncategorized")
    const amt = Number(r.amount ?? 0)
    const hasReceipt =
      Array.isArray(r.receipts) &&
      r.receipts.length > 0 &&
      typeof r.receipts[0].count === "number"
        ? r.receipts[0].count > 0
        : false

    grand += amt
    const slot = totals.get(key) ?? { label, total: 0, count: 0, withReceipt: 0 }
    slot.total += amt
    slot.count += 1
    if (hasReceipt) slot.withReceipt += 1
    totals.set(key, slot)
  }

  const rows: Row[] = Array.from(totals.entries())
    .map(([category_key, v]) => ({
      category_key,
      label: v.label,
      total_amount: v.total,
      count: v.count,
      with_receipt: v.withReceipt,
    }))
    .sort((a, b) => {
      const au = a.category_key === "uncategorized"
      const bu = b.category_key === "uncategorized"
      if (au && !bu) return 1
      if (!au && bu) return -1
      return (a.label || "").localeCompare(b.label || "")
    })

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-ww-4xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Schedule C summary</h1>
            <p className="mt-1 text-sm text-neutral-700">
              {pack ? `Filtered: ${pack}` : "All packs"} — {txnCount} transactions,{" "}
              {formatAmount(grand)} total.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/reports/schedule-c"
              className={`rounded-xl px-3 py-1.5 text-sm ${
                !pack ? "btn-primary text-white" : "btn-secondary"
              }`}
            >
              All
            </a>
            <a
              href="/reports/schedule-c?pack=general"
              className={`rounded-xl px-3 py-1.5 text-sm ${
                pack === "general" ? "btn-primary text-white" : "btn-secondary"
              }`}
            >
              General
            </a>
            <a
              href="/reports/schedule-c?pack=realtor"
              className={`rounded-xl px-3 py-1.5 text-sm ${
                pack === "realtor" ? "btn-primary text-white" : "btn-secondary"
              }`}
            >
              Realtor
            </a>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <Th>Category</Th>
                <Th className="text-right">Transactions</Th>
                <Th className="text-right">📎 Receipts</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.category_key} className="odd:bg-white even:bg-neutral-50">
                  <Td>{r.label || "Uncategorized"}</Td>
                  <Td className="text-right">{r.count.toLocaleString()}</Td>
                  <Td className="text-right">
                    {r.with_receipt}/{r.count}
                  </Td>
                  <Td className="text-right font-mono">{formatAmount(r.total_amount)}</Td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <Td colSpan={4}>
                    <div className="py-10 text-center text-neutral-600">
                      No transactions yet. Import a CSV to get started.
                    </div>
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <a href="/export" className="rounded-xl border px-3 py-1.5 text-sm">
            Export CSV
          </a>
          <a href="/review" className="rounded-xl border px-3 py-1.5 text-sm">
            Back to Review
          </a>
        </div>
      </section>
    </main>
  )
}

/* ----- tiny table helpers (typed) ----- */
function Th({
  children,
  className = "",
}: {
  children?: ReactNode
  className?: string
}) {
  return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th>
}

function Td({
  children,
  className = "",
  colSpan,
  title,
}: {
  children?: ReactNode
  className?: string
  colSpan?: number
  title?: string
}) {
  return (
    <td className={`px-3 py-2 align-top ${className}`} colSpan={colSpan} title={title}>
      {children}
    </td>
  )
}

function formatAmount(a: number) {
  return a.toLocaleString(undefined, { style: "currency", currency: "USD" })
}
