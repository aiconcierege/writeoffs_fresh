/* File: app/api/profile/init/route.ts
 * Version: v3
 * Date: 2025-10-15
 * Notes: Upserts the caller's profile with the selected vertical. Uses async createServerSupabase (Next 15).
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'

export async function POST(request: Request) {
  const supabase = await createServerSupabase()

  // Ensure the request is authenticated
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser()

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 401 })
  }
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Read desired vertical from body, default to 'general'
  let vertical: 'general' | 'realtor' = 'general'
  try {
    const body = await request.json()
    if (body?.vertical === 'realtor') vertical = 'realtor'
  } catch {
    // ignore malformed JSON; keep default
  }

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, vertical }, { onConflict: 'id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
