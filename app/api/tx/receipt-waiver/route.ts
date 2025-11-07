/* File: app/api/tx/receipt-waiver/route.ts
 * Version: v1
 * Date: 2025-10-14
 * Notes:
 *  - POST { id: string, waived: boolean, note?: string }
 *  - Sets transactions.receipt_waived and optional receipt_note for the caller’s row.
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'

export async function POST(req: Request) {
  const supabase = await createServerSupabase()

  // Require auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Parse body
  let id: unknown, waived: unknown, note: unknown
  try {
    const body = await req.json()
    id = body?.id
    waived = body?.waived
    note = body?.note
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (typeof id !== 'string' || typeof waived !== 'boolean') {
    return NextResponse.json({ error: 'id (string) and waived (boolean) are required' }, { status: 400 })
  }
  const payload: { receipt_waived: boolean; receipt_note?: string | null } = {
    receipt_waived: waived,
  }
  if (typeof note === 'string') payload.receipt_note = note
  if (note === null) payload.receipt_note = null

  // Update row (RLS ensures ownership)
  const { error } = await supabase
    .from('transactions')
    .update(payload)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
