/* File: app/api/tx/approve/route.ts
 * Version: v1
 * Date: 2025-10-15
 * Notes:
 *  - POST { id: string, approved?: boolean, notes?: string }
 *  - Sets approved (default true), clears needs_review when approving, and saves notes if provided.
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'

export async function POST(req: Request) {
  const supabase = await createServerSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let id: unknown, approved: unknown, notes: unknown
  try {
    const body = await req.json()
    id = body?.id
    approved = body?.approved
    notes = body?.notes
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (typeof id !== 'string') {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const approveVal = typeof approved === 'boolean' ? approved : true

  const payload: Record<string, any> = {
    approved: approveVal,
  }
  // When approving, clear needs_review
  if (approveVal) payload.needs_review = false
  if (typeof notes === 'string') payload.notes = notes
  if (notes === null) payload.notes = null

  const { error } = await supabase
    .from('transactions')
    .update(payload)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
