/* File: app/api/receipts/delete/route.ts
 * Version: v1
 * Date: 2025-10-14
 * Notes:
 *  - POST { id: string }
 *  - Deletes the caller’s receipt record and its file from the private 'receipts' bucket.
 *  - Order: fetch row → delete storage object → delete DB row (RLS enforces ownership).
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'

export async function POST(req: Request) {
  const supabase = await createServerSupabase()

  // Require auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Parse body
  let id: unknown
  try {
    const body = await req.json()
    id = body?.id
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // 1) Fetch the row to get storage_path (RLS ensures caller owns it)
  const { data: row, error: fetchErr } = await supabase
    .from('receipts')
    .select('id, storage_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 })
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Canonical document evidence is historical and must not be destroyed, even
  // when its relationship has since been revoked.
  const { data: canonicalLink, error: canonicalLinkError } = await supabase
    .from('bookkeeping_document_links')
    .select('id')
    .eq('receipt_id', id)
    .limit(1)
    .maybeSingle()
  if (canonicalLinkError) {
    return NextResponse.json({ error: canonicalLinkError.message }, { status: 400 })
  }
  if (canonicalLink) {
    return NextResponse.json(
      { error: 'receipt is preserved as canonical bookkeeping evidence' },
      { status: 409 }
    )
  }

  // 2) Delete the file from Storage (ignore if missing)
  const storagePath = row.storage_path as string
  const { error: storageErr } = await supabase.storage.from('receipts').remove([storagePath])
  if (storageErr && storageErr.message && !/Not Found/i.test(storageErr.message)) {
    // Hard fail only if it’s not a simple 'not found'
    return NextResponse.json({ error: storageErr.message }, { status: 400 })
  }

  // 3) Delete the DB row
  const { error: dbErr } = await supabase
    .from('receipts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
