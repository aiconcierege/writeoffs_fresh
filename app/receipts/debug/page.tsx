/* File: app/receipts/debug/page.tsx
 * Version: v2 (null-safe + typed)
 * Notes: Server page to list the current user's recent receipts from public.receipts.
 */
import { redirect } from "next/navigation"
import { createServerSupabase } from "../../../utils/supabase/server"
import type { ReactNode } from "react"

type Rec = {
  id: string
  storage_path: string
  mime_type: string
  bytes: number
  created_at: string
  transaction_id: string | null
}

export default async function ReceiptsDebugPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: rows, error } = await supabase
    .from("receipts")
    .select("id,storage_path,mime_type,bytes,created_at,transaction_id")
    .order("created_at", { ascending: false })
    .limit(50)

  // ✅ Normalize to an array so TS is happy everywhere
  const safeRows: Rec[] = Array.isArray(rows) ? (rows as Rec[]) : []

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-bold">Receipts — debug view</h1>

        {error ? (
          <p className="mt-3 text-sm text-red-700">Error: {error.message}</p>
        ) : (
          <p className="mt-3 text-sm text-neutral-700">
            Showing {safeRows.length} row{safeRows.length === 1 ? "" : "s"} for{" "}
            <span className="font-mono">{user.email}</span>.
          </p>
        )}

        <div className="mt-6 overflow-x-auto rounded-2xl border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <Th>ID</Th>
                <Th>Path</Th>
                <Th>Type</Th>
                <Th className="text-right">Size</Th>
                <Th>Linked Tx</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {safeRows.map((r) => (
                <tr key={r.id} className="odd:bg-white even:bg-neutral-50">
                  <Td className="font-mono">{r.id}</Td>
                  <Td className="max-w-[40ch] truncate" title={r.storage_path}>
                    {r.storage_path}
                  </Td>
                  <Td>{r.mime_type}</Td>
                  <Td className="text-right">{formatBytes(r.bytes)}</Td>
                  <Td>
                    {r.transaction_id ? (
                      <span className="font-mono">{r.transaction_id}</span>
                    ) : (
                      <span className="text-neutral-500">—</span>
                    )}
                  </Td>
                  <Td>{new Date(r.created_at).toLocaleString()}</Td>
                </tr>
              ))}

              {safeRows.length === 0 && !error && (
                <tr>
                  <Td colSpan={6}>
                    <div className="py-10 text-center text-neutral-600">
                      No receipts found. Try uploading on{" "}
                      <a href="/receipts" className="underline">
                        /receipts
                      </a>
                      .
                    </div>
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex gap-2">
          <a href="/receipts" className="rounded-xl border px-3 py-1.5 text-sm">
            Open Receipts
          </a>
          <a href="/review" className="rounded-xl border px-3 py-1.5 text-sm">
            Back to Review
          </a>
        </div>
      </section>
    </main>
  )
}

/* ---------- small components ---------- */

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

/* ---------- helpers ---------- */
function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
