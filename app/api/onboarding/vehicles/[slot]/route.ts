import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../utils/supabase/server'
import { validateOnboardingVehicle } from '../../../../lib/onboarding/validation'

type RouteContext = { params: Promise<{ slot: string }> }

function parseSlot(value: string) {
  return value === '1' || value === '2' ? Number(value) : null
}

export async function PUT(request: Request, context: RouteContext) {
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const validation = validateOnboardingVehicle(body)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
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

  const { data: activeVehicle, error: vehicleError } = await supabase
    .from('business_vehicles')
    .select('id')
    .eq('business_id', business.id)
    .eq('slot', slot)
    .is('archived_at', null)
    .maybeSingle()

  if (vehicleError) {
    return NextResponse.json({ error: vehicleError.message }, { status: 400 })
  }

  if (activeVehicle) {
    const { error, count } = await supabase
      .from('business_vehicles')
      .update(validation.update, { count: 'exact' })
      .eq('id', activeVehicle.id)
      .eq('business_id', business.id)
      .eq('slot', slot)
      .is('archived_at', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (count !== 1) {
      return NextResponse.json({ error: 'vehicle is unavailable' }, { status: 409 })
    }
    return NextResponse.json({ ok: true, slot, created: false })
  }

  const { error: insertError, count } = await supabase
    .from('business_vehicles')
    .insert(
      { business_id: business.id, slot, ...validation.update },
      { count: 'exact' }
    )

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 })
  }
  if (count !== 1) {
    return NextResponse.json({ error: 'vehicle was not created' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, slot, created: true }, { status: 201 })
}
