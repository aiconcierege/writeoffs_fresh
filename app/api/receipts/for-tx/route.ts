/* File: app/api/receipts/for-tx/route.ts
 * Version: v2
 * Date: 2025-11-07
 * Notes:
 *  - GET /api/receipts/for-tx?id=<transaction_id>
 *  - Returns an authenticated preview URL for each linked receipt (caller’s data only).
 */
import { NextResponse } from "next/server"
import { createServerSupabase } from "../../../../utils/supabase/server"

export async function GET(req: Request) {
  const supabase = await createServerSupabase()
  const url = new URL(req.url)
  const txId = url.searchParams.get("id")

  // 🔒 Require authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (!txId) {
    return NextResponse.json({ error: "missing id" }, { status: 400 })
  }

  // 📄 Fetch receipts for this transaction (RLS ensures ownership)
  const { data: rows, error } = await supabase
    .from("receipts")
    .select("id, storage_path, mime_type, bytes, created_at")
    .eq("transaction_id", txId)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // ⚙️ Null-safe: ensure rows is an array
  const safeRows = Array.isArray(rows) ? rows : []

  // The shared preview verifies derived receipt bytes, or signs an ordinary
  // original. Never attempt to sign a derived crop as a separate stored object.
  const signed = safeRows.map(r => ({
        id: r.id,
        mime_type: r.mime_type,
        bytes: r.bytes,
        created_at: r.created_at,
        signed_url: new URL(`/api/receipts/${encodeURIComponent(r.id)}/view`,req.url).toString(),
      }))

  return NextResponse.json({ ok: true, receipts: signed })
}
