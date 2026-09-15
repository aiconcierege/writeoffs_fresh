export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '../../utils/supabase/server'
import { onboardingNeedsFollowUp, type OnboardingBusinessData } from '../lib/onboarding/progress'
import { ACCOUNTING_SENSITIVE_BUSINESS_FACTS } from '../lib/onboarding/validation'
import {CatchUpPaymentPending} from './CatchUpPaymentPending'
import OnboardingFlow from './OnboardingFlow'

const BUSINESS_FIELDS =
  'id, name, business_description, business_profile_context, schedule_c_eligibility, business_stage, business_start_month, uses_customer_job_materials, keeps_future_sale_merchandise, prior_materials_handling, catch_up_start_date, onboarding_start_method, v1_support_status, v1_support_reason, onboarding_state, onboarding_version, onboarding_completed_at'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string | string[]; catch_up?: string }>
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

  const { data: factEvents, error: factEventsError } = business
    ? await supabase.from('business_fact_events')
      .select('id,fact_key,supersedes_event_id')
      .eq('business_id', business.id)
    : { data: [], error: null }

  if (businessError || factEventsError || !business) {
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

  if(params.catch_up==='processing'){const {data:order}=await supabase.from('customer_catch_up_orders').select('paid_at').eq('business_id',business.id).is('canceled_at',null).order('consent_at',{ascending:false}).limit(1).maybeSingle();if(order&&!order.paid_at)return <CatchUpPaymentPending/>}

  const superseded = new Set((factEvents ?? []).map((event) => event.supersedes_event_id).filter(Boolean))
  const sensitiveFactRevisions = Object.fromEntries(ACCOUNTING_SENSITIVE_BUSINESS_FACTS.map((key) => [
    key,
    (factEvents ?? []).find((event) => event.fact_key === key && !superseded.has(event.id))?.id ?? null,
  ]))
  const {data: membershipStart}=await supabase.from('business_memberships').select('created_at').eq('business_id',business.id).maybeSingle()
  const joinedMonth=(membershipStart?.created_at??new Date().toISOString()).slice(0,7)
  const [{data:historicalMileage},{data:vehicles}]=await Promise.all([supabase.from('current_historical_mileage').select('id,answer').eq('business_id',business.id).eq('tax_year',Number(joinedMonth.slice(0,4))).order('tax_year',{ascending:false}).limit(1).maybeSingle(),supabase.from('business_vehicles').select('id,display_name').eq('business_id',business.id).is('archived_at',null)])
  const onboardingBusiness = { ...business, historical_mileage_answer: historicalMileage?.answer, sensitive_fact_revisions: sensitiveFactRevisions } as OnboardingBusinessData

  if (!editing && !onboardingNeedsFollowUp(onboardingBusiness)) redirect('/home')


  return (
    <OnboardingFlow
      initialBusiness={onboardingBusiness}
      joinedMonth={joinedMonth}
      editing={editing}
      vehicles={vehicles??[]}
      historicalMileageId={historicalMileage?.id}
    />
  )
}
