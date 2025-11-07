/* File: app/api/tx/undo-ocr/route.ts
 * Version: v1
 * Date: 2025-10-15
 * Notes:
 *  - POST { tx_id: string }
 *  - Deletes the given transaction (must belong to current user)
 *  - Unlinks any receipt that points to this transaction (sets transaction_id = null)
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'

export async function POST(req: Request) {
  const supabase = await createServerSupabase()

  // auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // body
  let tx_id: unknown
  try {
    const body = await req.json()
    tx_id = body?.tx_id
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (typeof tx_id !== 'string') {
    return NextResponse.json({ error: 'tx_id required' }, { status: 400 })
  }

  // verify tx belongs to user
  const { data: tx } = await supabase
    .from('transactions')
    .select('id')
    .eq('id', tx_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!tx) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // unlink receipts
  await supabase
    .from('receipts')
    .update({ transaction_id: null })
    .eq('transaction_id', tx_id)

  // delete tx
  const { error: delErr } = await supabase
    .from('transactions')
    .delete()
    .eq('id', tx_id)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
