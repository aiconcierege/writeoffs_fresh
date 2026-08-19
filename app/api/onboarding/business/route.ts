import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { validateOnboardingBusinessPatch } from '../../../lib/onboarding/validation'

export async function PATCH(request: Request) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const validation = validateOnboardingBusinessPatch(body)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const { data: business, error: lookupError } = await supabase
    .from('businesses')
    .select('id, onboarding_state')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 400 })
  }
  if (!business) {
    return NextResponse.json(
      { error: 'business profile is unavailable' },
      { status: 409 }
    )
  }

  const update = {
    ...validation.update,
    onboarding_state:
      business.onboarding_state === 'completed' ? 'completed' : 'in_progress',
    onboarding_version: 3,
  }

  const { error: updateError, count } = await supabase
    .from('businesses')
    .update(update, { count: 'exact' })
    .eq('id', business.id)
    .eq('owner_user_id', user.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }
  if (count !== 1) {
    return NextResponse.json(
      { error: 'business profile is unavailable' },
      { status: 409 }
    )
  }

  if (validation.profile) {
    const { error: profileError, count: profileCount } = await supabase
      .from('profiles')
      .update({ vertical: validation.profile }, { count: 'exact' })
      .eq('id', user.id)
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 })
    if (profileCount !== 1) return NextResponse.json({ error: 'profile is unavailable' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, step: validation.step })
}
