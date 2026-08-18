import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { recommendOnboardingPlan } from '../../../lib/onboarding/plan-recommendation'
import { validateCompleteOnboarding } from '../../../lib/onboarding/validation'

const BUSINESS_COMPLETION_FIELDS =
  'id, business_description, legal_structure, federal_tax_reporting_type, business_start_month, has_qualifying_home_office, home_office_square_feet, uses_vehicle_for_business, expected_financial_account_count, expected_financial_account_use, onboarding_start_method'

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

  const { data: activeVehicles, error: vehiclesError } = await supabase
    .from('business_vehicles')
    .select('slot, display_name, vehicle_year, make, model, is_mixed_use')
    .eq('business_id', business.id)
    .is('archived_at', null)
    .order('slot')

  if (vehiclesError) {
    return NextResponse.json({ error: vehiclesError.message }, { status: 400 })
  }

  const validation = validateCompleteOnboarding(business, activeVehicles)
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'onboarding is incomplete', validation },
      { status: 422 }
    )
  }

  const recommendation = recommendOnboardingPlan({
    expected_financial_account_count:
      business.expected_financial_account_count,
    onboarding_start_method: business.onboarding_start_method,
  })
  const completedAt = new Date().toISOString()
  const { error: updateError, count } = await supabase
    .from('businesses')
    .update(
      {
        onboarding_state: 'completed',
        onboarding_version: 2,
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
    recommendation,
    destination: '/home',
  })
}
