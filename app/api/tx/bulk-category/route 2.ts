/* File: app/api/tx/bulk-category/route.ts
 * Version: v2
 * Date: 2025-10-14
 * Notes: Await async createServerSupabase() (Next 15 cookies semantics).
 * Body: { ids: string[], category_key: string | null }
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'

export async function POST(req: Request) {
  const supabase = await createServerSupabase()

  // Require auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Parse body
  let ids: unknown, category_key: string | null | undefined
  try {
    const body = await req.json()
    ids = body?.ids
    category_key = body?.category_key ?? null
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // Validate ids
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === 'string')) {
    return NextResponse.json({ error: 'ids must be a non-empty array of strings' }, { status: 400 })
  }

  // Validate category (allow null to clear)
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

  // Update only rows owned by this user (RLS enforces ownership too)
  const { error } = await supabase
    .from('transactions')
    .update({ category_key })
    .in('id', ids as string[])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, updated: (ids as string[]).length })
}
