/* File: app/api/receipts/route.ts
 * Version: v5
 * Date: 2025-11-07
 * Notes:
 *   - GET  /api/receipts?limit=20 → list recent receipts (linked or not) for the signed-in user
 *     RETURNS: id, storage_path, original_name, mime_type, bytes, created_at, transaction_id,
 *              vendor_hint, date_hint, total_hint, ocr_provider, ocr_status, ocr_confidence,
 *              signed_url
 *   - POST /api/receipts          → link a receipt to a transaction { receipt_id, transaction_id }
 */
import { NextResponse } from "next/server"
import { createServerSupabase } from "../../../utils/supabase/server"

export async function GET(request: Request) {
  const supabase = await createServerSupabase()
  const url = new URL(request.url)
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? "20")))

  // 🔒 Auth
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  // 📄 Fetch recent receipts for this user (linked or not)
  const { data: rows, error } = await supabase
    .from("receipts")
    .select(
      `
      id,
      storage_path,
      original_name,
      mime_type,
      bytes,
      created_at,
      transaction_id,
      vendor_hint,
      date_hint,
      total_hint,
      ocr_provider,
      ocr_status,
      ocr_confidence
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // ✅ Null-safe: ensure rows is an array before mapping
  const safeRows = Array.isArray(rows) ? rows : []

  // 🔐 Attach short-lived signed URLs
  const withSigned = await Promise.all(
    safeRows.map(async (r: any) => {
      const { data: signed } = await supabase.storage
        .from("receipts")
        .createSignedUrl(r.storage_path, 60)
      return { ...r, signed_url: signed?.signedUrl ?? null }
    })
  )

  return NextResponse.json({ ok: true, receipts: withSigned })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let receipt_id: string | undefined
  let transaction_id: string | undefined

  try {
    const body = await request.json()
    receipt_id = body?.receipt_id
    transaction_id = body?.transaction_id
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  if (!receipt_id || !transaction_id) {
    return NextResponse.json(
      { error: "missing receipt_id or transaction_id" },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from("receipts")
    .update({ transaction_id })
    .eq("id", receipt_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
