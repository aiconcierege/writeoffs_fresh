/* File: app/api/tx/category/route.ts
 * Version: v2
 * Date: 2025-10-14
 * Notes: Await async createServerSupabase() (Next 15 cookies semantics).
 * Body: { id: string, category_key: string | null }
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'

export async function POST(req: Request) {
  const supabase = await createServerSupabase()

  // Auth required
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Parse body
  let id: string | undefined
  let category_key: string | null | undefined
  try {
    const body = await req.json()
    id = body?.id
    category_key = body?.category_key ?? null
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'missing id' }, { status: 400 })
  }

  // If provided, ensure the category exists (allow null to clear)
  if (category_key !== null) {
    const { data: cat } = await supabase
      .from('categories')
      .select('key')
      .eq('key', category_key)
      .maybeSingle()
    if (!cat) {
      return NextResponse.json({ error: 'unknown category_key' }, { status: 400 })
    }
  }

  // Update row (RLS enforces ownership)
  const { error } = await supabase
    .from('transactions')
    .update({ category_key })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
