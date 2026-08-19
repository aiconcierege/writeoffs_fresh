export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '../../utils/supabase/server'
import { onboardingNeedsFollowUp, type OnboardingBusinessData } from '../lib/onboarding/progress'
import OnboardingFlow from './OnboardingFlow'

const BUSINESS_FIELDS =
  'id, name, business_description, business_profile_context, schedule_c_eligibility, business_stage, business_start_month, uses_customer_job_materials, keeps_future_sale_merchandise, prior_materials_handling, catch_up_start_date, onboarding_start_method, v1_support_status, v1_support_reason, onboarding_state, onboarding_version, onboarding_completed_at'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string | string[] }>
}) {
  const params = await searchParams
  const editing = params.edit === '1'
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

  if (!editing && !onboardingNeedsFollowUp(business as OnboardingBusinessData)) redirect('/home')

  return (
    <OnboardingFlow
      initialBusiness={business as OnboardingBusinessData}
    />
  )
}
