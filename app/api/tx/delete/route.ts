/* File: app/api/tx/delete/route.ts
 * Version: v1
 * Date: 2025-10-14
 * Notes:
 *  - POST { id: string }
 *  - Deletes a single transaction owned by the caller.
 *  - Any linked receipts are automatically unlinked (receipts.transaction_id ON DELETE SET NULL).
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

  // Delete the transaction (RLS must ensure this row belongs to the user)
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
