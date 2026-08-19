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
  const { data: completion, error: completionError } = await supabase
    .rpc('complete_business_onboarding_v3', { p_business_id: business.id })
  if (completionError) {
    const incomplete = completionError.message.includes('onboarding is incomplete')
    return NextResponse.json(
      { error: incomplete ? 'onboarding is incomplete' : completionError.message },
      { status: incomplete ? 422 : 400 }
    )
  }
  return NextResponse.json({ ok: true, ...completion })
}
