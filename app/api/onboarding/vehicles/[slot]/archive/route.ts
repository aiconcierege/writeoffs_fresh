import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../../utils/supabase/server'

type RouteContext = { params: Promise<{ slot: string }> }

function parseSlot(value: string) {
  return value === '1' || value === '2' ? Number(value) : null
}

export async function PATCH(_request: Request, context: RouteContext) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const slot = parseSlot((await context.params).slot)
  if (slot === null) {
    return NextResponse.json({ error: 'slot must be 1 or 2' }, { status: 400 })
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (businessError) {
    return NextResponse.json({ error: businessError.message }, { status: 400 })
  }
  if (!business) {
    return NextResponse.json(
      { error: 'business profile is unavailable' },
      { status: 409 }
    )
  }

  const { error, count } = await supabase
    .from('business_vehicles')
    .update({ archived_at: new Date().toISOString() }, { count: 'exact' })
    .eq('business_id', business.id)
    .eq('slot', slot)
    .is('archived_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, slot, archived: count === 1 })
}
