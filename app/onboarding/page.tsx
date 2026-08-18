export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '../../utils/supabase/server'
import type {
  OnboardingBusinessData,
  OnboardingVehicleData,
} from '../lib/onboarding/progress'
import OnboardingFlow from './OnboardingFlow'

const BUSINESS_FIELDS =
  'id, name, business_description, legal_structure, federal_tax_reporting_type, business_start_month, has_qualifying_home_office, home_office_square_feet, uses_vehicle_for_business, expected_financial_account_count, expected_financial_account_use, onboarding_start_method, onboarding_state, onboarding_version, onboarding_completed_at'

export default async function OnboardingPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select(BUSINESS_FIELDS)
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (businessError || !business) {
    return (
      <section className="mx-auto max-w-xl py-12">
        <div className="card p-6 sm:p-8" role="alert">
          <h1 className="text-2xl font-bold text-slate-950">
            We couldn’t load your setup right now.
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            Refresh the page to try again. If the problem continues, sign out and
            sign back in.
          </p>
          <Link href="/onboarding" className="btn btn-primary mt-5 inline-flex min-h-11 items-center px-5">
            Try again
          </Link>
        </div>
      </section>
    )
  }

  if (business.onboarding_state === 'completed') redirect('/home')

  const { data: vehicles, error: vehiclesError } = await supabase
    .from('business_vehicles')
    .select('slot, display_name, vehicle_year, make, model, is_mixed_use')
    .eq('business_id', business.id)
    .is('archived_at', null)
    .order('slot')

  if (vehiclesError) {
    return (
      <section className="mx-auto max-w-xl py-12">
        <div className="card p-6 sm:p-8" role="alert">
          <h1 className="text-2xl font-bold text-slate-950">
            We couldn’t load your vehicles right now.
          </h1>
          <p className="mt-3 text-sm text-slate-600">Refresh the page to try again.</p>
          <Link href="/onboarding" className="btn btn-primary mt-5 inline-flex min-h-11 items-center px-5">
            Try again
          </Link>
        </div>
      </section>
    )
  }

  return (
    <OnboardingFlow
      initialBusiness={business as OnboardingBusinessData}
      initialVehicles={(vehicles ?? []) as OnboardingVehicleData[]}
    />
  )
}
