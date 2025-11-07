// app/reports/summary/page.tsx
"use client"

import { useEffect, useState } from "react"
import { cn } from "../../lib/utils"

type SummaryData = {
  totalExpenses: number
  categorizedCount: number
  uncategorizedCount: number
  monthChange: number
  categoryTotals: { category: string; amount: number }[]
}

export default function ReportsSummary() {
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const res = await fetch("/api/reports/summary", { cache: "no-store" })
        if (res.ok) {
          const json = await res.json()
          setData(json)
        } else {
          setData(null)
        }
      } catch {
        setData(null)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-muted text-sm">Loading summary…</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="card p-6">
        <p className="text-sm text-muted">
          No data yet. Import transactions and come back to Reports.
        </p>
      </div>
    )
  }

  const { totalExpenses, categorizedCount, uncategorizedCount, monthChange, categoryTotals } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports Summary</h1>
        <p className="mt-1 text-sm text-muted">
          Overview of your tracked expenses and categorization health.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Expenses (12 mo)"
          value={fmtCurrency(totalExpenses)}
        />
        <StatCard
          label="Categorized"
          value={fmtNumber(categorizedCount)}
        />
        <StatCard
          label="Uncategorized"
          value={fmtNumber(uncategorizedCount)}
        />
        <StatCard
          label="This Month vs Last"
          value={`${monthChange > 0 ? "+" : ""}${monthChange.toFixed(1)}%`}
          trend={monthChange}
        />
      </div>

      {/* Category totals */}
      <div className="card overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <h2 className="text-base font-medium">Category Totals</h2>
          <p className="text-sm text-muted">Top categories across the last 12 months.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y">
              <tr className="text-left text-muted">
                <th className="px-6 py-2 font-medium">Category</th>
                <th className="px-6 py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(categoryTotals || []).slice(0, 10).map((row) => (
                <tr key={row.category} className="border-b last:border-0">
                  <td className="px-6 py-2">{row.category}</td>
                  <td className="px-6 py-2 text-right">
                    {fmtCurrency(Math.abs(row.amount))}
                  </td>
                </tr>
              ))}
              {(!categoryTotals || categoryTotals.length === 0) && (
                <tr>
                  <td className="px-6 py-4 text-muted" colSpan={2}>
                    No categorized transactions in the window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  trend,
}: {
  label: string
  value: string | number
  trend?: number
}) {
  const trendUp = (trend ?? 0) > 0
  const trendColor = trend === undefined ? "" : trendUp ? "text-red-600" : "text-green-600"
  const chipBg =
    trend === undefined
      ? ""
      : trendUp
      ? "bg-red-100/60"
      : "bg-green-100/60"

  return (
    <div className="card p-4">
      <div className="text-sm text-muted mb-1">{label}</div>
      <div className="text-xl font-semibold">{value}</div>

      {trend !== undefined && (
        <div
          className={cn(
            "inline-flex items-center gap-1 mt-2 rounded-full px-2 py-0.5 text-xs font-medium",
            chipBg,
            trendColor
          )}
        >
          <span aria-hidden>{trendUp ? "↑" : "↓"}</span>
          <span>{Math.abs(trend).toFixed(1)}%</span>
        </div>
      )}
    </div>
  )
}

/* ——— helpers ——— */
function fmtCurrency(n: number) {
  try {
    return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })
  } catch {
    return `$${(Math.round(n * 100) / 100).toFixed(2)}`
  }
}
function fmtNumber(n: number) {
  try {
    return n.toLocaleString()
  } catch {
    return String(n)
  }
}
