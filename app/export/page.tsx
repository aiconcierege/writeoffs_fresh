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
      alert("We couldn’t prepare that download. Please try again.")
    } finally {
      setLoading(null)
    }
  }

  return (
    <main className="page-container page-container-narrow space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Reports</p><h1 className="page-title">Export records</h1>
          <p className="page-description">
            Download your current business activity for bookkeeping or tax preparation.
          </p>
        </div>
      </div>

      {/* Card */}
      <section className="surface space-y-5 p-5 sm:p-7">
        <div className="space-y-1">
          <h2 className="text-base font-medium">CSV Exports</h2>
          <p className="text-sm text-muted">
            Export everything, or only activity WriteOffs is still working on.
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
            {loading === "uncat" ? "Exporting…" : "Export CSV (needs attention)"}
          </button>
        </div>

        <div className="pt-2">
          <p className="text-xs text-muted">
            Exports reflect current treatment and preserve receipt-only activity without duplicating matched historical records.
          </p>
        </div>
      </section>
    </main>
  )
}
