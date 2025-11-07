// app/export/page.tsx
"use client"

import { useState } from "react"
import { cn } from "../lib/utils"

export default function ExportPage() {
  const [loading, setLoading] = useState<"all" | "uncat" | null>(null)

  // Update these if your API routes differ
  const URL_ALL = "/api/export/csv?scope=all"                // all approved (respecting user pack on server)
  const URL_UNCATEGORIZED = "/api/export/csv?scope=uncategorized"

  async function downloadCsv(url: string, filename: string, key: "all" | "uncat") {
    try {
      setLoading(key)
      const res = await fetch(url, { method: "GET" })
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = href
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
    } catch (e) {
      console.error(e)
      alert("Sorry — the export failed. Check your API route and try again.")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Export</h1>
          <p className="mt-1 text-sm text-muted">
            Download CSVs for bookkeeping or Schedule C prep. Your server will
            respect the user’s pack from their profile — no selector here.
          </p>
        </div>
      </div>

      {/* Card */}
      <div className="card p-4 sm:p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-medium">CSV Exports</h2>
          <p className="text-sm text-muted">
            Two quick pulls: everything, or only transactions missing categories.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() =>
              downloadCsv(URL_ALL, "writeoffs-all.csv", "all")
            }
            disabled={loading !== null}
            className={cn(
              "btn btn-primary",
              "disabled:opacity-70 disabled:cursor-not-allowed"
            )}
          >
            {loading === "all" ? "Exporting…" : "Export CSV (all)"}
          </button>

          <button
            onClick={() =>
              downloadCsv(URL_UNCATEGORIZED, "writeoffs-uncategorized.csv", "uncat")
            }
            disabled={loading !== null}
            className={cn(
              "btn btn-secondary",
              "disabled:opacity-70 disabled:cursor-not-allowed"
            )}
          >
            {loading === "uncat" ? "Exporting…" : "Export CSV (uncategorized)"}
          </button>
        </div>

        <div className="pt-2">
          <p className="text-xs text-muted">
            Tip: open the CSV in Excel/Sheets to spot anomalies. For audit armor,
            keep your receipts zipped in the same folder as the CSV.
          </p>
        </div>
      </div>
    </div>
  )
}
