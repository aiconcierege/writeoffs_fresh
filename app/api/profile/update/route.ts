/* File: app/api/profile/update/route.ts
 * Version: v1
 * Date: 2025-11-04
 * Purpose: Update the signed-in user's profile (pack + business + theme + contact fields).
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'

type Payload = {
  vertical?: 'general' | 'realtor' | 'driver' | 'creator'
  business_name?: string | null
  owner_name?: string | null
  contact_email?: string | null
  phone?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  region?: string | null
  postal_code?: string | null
  country?: string | null
  theme?: 'system' | 'light' | 'dark'
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase()

  // Auth guard
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Parse body
  let body: Payload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // Whitelist allowed fields
  const allowed: Record<string, unknown> = {}
  const assign = (k: keyof Payload) => {
    if (k in body) allowed[k] = (body as any)[k]
  }
  ;[
    'vertical',
    'business_name',
    'owner_name',
    'contact_email',
    'phone',
    'address_line1',
    'address_line2',
    'city',
    'region',
    'postal_code',
    'country',
    'theme',
  ].forEach(k => assign(k as keyof Payload))

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  // Persist
  const { error } = await supabase
    .from('profiles')
    .update(allowed)
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
