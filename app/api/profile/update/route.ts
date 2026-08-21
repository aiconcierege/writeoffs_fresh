/* File: app/api/profile/update/route.ts
 * Version: v1
 * Date: 2025-11-04
 * Purpose: Update the signed-in user's profile and business contact fields.
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'

type Payload = {
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

  const profileUpdate: Record<string, unknown> = {}
  if ('theme' in body) profileUpdate.theme = body.theme

  const businessUpdate: Record<string, unknown> = {}
  const businessFields: Array<keyof Pick<
    Payload,
    | 'owner_name'
    | 'contact_email'
    | 'phone'
    | 'address_line1'
    | 'address_line2'
    | 'city'
    | 'postal_code'
  >> = [
    'owner_name',
    'contact_email',
    'phone',
    'address_line1',
    'address_line2',
    'city',
    'postal_code',
  ]

  if ('business_name' in body) businessUpdate.name = body.business_name
  if ('region' in body) businessUpdate.state = body.region?.trim().toUpperCase() || null
  if ('country' in body) businessUpdate.country = body.country?.trim().toUpperCase() || 'US'
  for (const field of businessFields) {
    if (field in body) businessUpdate[field] = body[field]
  }

  if (Object.keys(profileUpdate).length === 0 && Object.keys(businessUpdate).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  if (businessUpdate.country && businessUpdate.country !== 'US') {
    return NextResponse.json({ error: 'only US businesses are supported' }, { status: 400 })
  }

  if (businessUpdate.state && !/^[A-Z]{2}$/.test(String(businessUpdate.state))) {
    return NextResponse.json({ error: 'state must be a two-letter US code' }, { status: 400 })
  }

  if (Object.keys(profileUpdate).length > 0) {
    const { error, count } = await supabase
      .from('profiles')
      .update(profileUpdate, { count: 'exact' })
      .eq('id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (count !== 1) {
      return NextResponse.json({ error: 'profile is unavailable' }, { status: 409 })
    }
  }

  if (Object.keys(businessUpdate).length > 0) {
    const { error, count } = await supabase
      .from('businesses')
      .update(businessUpdate, { count: 'exact' })
      .eq('owner_user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (count !== 1) {
      return NextResponse.json({ error: 'business profile is unavailable' }, { status: 409 })
    }
  }

  return NextResponse.json({ ok: true })
}
