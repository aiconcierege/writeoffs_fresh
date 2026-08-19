import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { validateCompleteOnboarding } from '../../../lib/onboarding/validation'

const BUSINESS_COMPLETION_FIELDS =
  'id, business_description, business_profile_context, schedule_c_eligibility, business_stage, business_start_month, uses_customer_job_materials, keeps_future_sale_merchandise, prior_materials_handling, catch_up_start_date, onboarding_start_method, v1_support_status, v1_support_reason, onboarding_state, onboarding_version, onboarding_completed_at'

export async function POST() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select(BUSINESS_COMPLETION_FIELDS)
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

  const validation = validateCompleteOnboarding(business)
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'onboarding is incomplete', validation },
      { status: 422 }
    )
  }

  if (business.onboarding_state === 'completed' && business.onboarding_version === 3) {
    return NextResponse.json({ ok: true, completedAt: business.onboarding_completed_at, destination: '/home' })
  }
  const completedAt = new Date().toISOString()
  const { error: updateError, count } = await supabase
    .from('businesses')
    .update(
      {
        onboarding_state: 'completed',
        onboarding_version: 3,
        onboarding_completed_at: completedAt,
      },
      { count: 'exact' }
    )
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

  return NextResponse.json({
    ok: true,
    completedAt,
    destination: '/home',
  })
}
