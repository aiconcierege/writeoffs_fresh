import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { customerQuestionHeadline } from '../lib/bookkeeping/customer-questions'
import { getAuthenticatedCanonicalReport } from '../lib/bookkeeping/reporting-service'
import { HomeGreeting } from './HomeGreeting'
import { countReceiptsNeedingAttention } from '../lib/bookkeeping/receipt-workflow'
import { onboardingNeedsFollowUp, type OnboardingBusinessData } from '../lib/onboarding/progress'
import { ReceiptUploadAction } from '../receipts/ReceiptUploadAction'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function firstNameFromMetadata(metadata: Record<string, unknown>) {
  const candidate = [metadata.first_name, metadata.full_name, metadata.name]
    .find((value) => typeof value === 'string' && value.trim())
  if (typeof candidate !== 'string') return null
  const firstName = candidate.trim().split(/\s+/)[0]
  return firstName.length <= 60 ? firstName : null
}

export default async function HomePage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: onboardingBusiness } = await supabase
    .from('businesses')
    .select('business_description, business_profile_context, schedule_c_eligibility, business_stage, business_start_month, uses_customer_job_materials, keeps_future_sale_merchandise, prior_materials_handling, catch_up_start_date, onboarding_start_method, v1_support_status, onboarding_state, onboarding_version')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  const needsOnboardingFollowUp = onboardingBusiness
    ? onboardingNeedsFollowUp(onboardingBusiness as Pick<OnboardingBusinessData,
      'business_description' | 'business_profile_context' | 'schedule_c_eligibility' | 'business_stage' |
      'business_start_month' | 'uses_customer_job_materials' | 'keeps_future_sale_merchandise' |
      'prior_materials_handling' | 'catch_up_start_date' | 'onboarding_start_method' |
      'v1_support_status' | 'onboarding_state' | 'onboarding_version'>)
    : true

  const periodEnd = new Date().toISOString().slice(0, 10)
  const summary = await getAuthenticatedCanonicalReport({
    supabase,
    periodStart: `${periodEnd.slice(0, 4)}-01-01`,
    periodEnd,
    currency: 'USD',
  })
  const receiptAttentionCount = await countReceiptsNeedingAttention(supabase)
  const questionCount = summary.completeness.unresolvedCustomerQuestionCount
  const attentionCount = questionCount + receiptAttentionCount
  const processingComplete = summary.completeness.isComplete
  const firstName = firstNameFromMetadata(user.user_metadata ?? {})
  const financialLines = [
    { label: 'Business income', value: summary.businessIncomeCents },
    { label: 'Business expenses', value: summary.businessExpensesCents },
    { label: 'Estimated business profit', value: summary.businessProfitCents, emphasized: true },
    ...(summary.estimatedDeductionsCents == null ? [] : [
      { label: 'Estimated deductions', value: summary.estimatedDeductionsCents, emphasized: false },
    ]),
  ]

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#fbfbfa]">
      <div className="mx-auto max-w-4xl px-2 py-9 sm:px-6 sm:py-12 lg:py-14">
        <header className="max-w-2xl">
          <HomeGreeting firstName={firstName} />
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.025em] text-slate-950 sm:text-4xl">
            {attentionCount > 0
              ? `${attentionCount} ${attentionCount === 1 ? 'thing needs' : 'things need'} your attention.`
              : processingComplete
                ? 'Your books are up to date.'
                : 'WriteOffs is working.'}
          </h1>
          <p className="mt-3 max-w-xl text-base leading-6 text-slate-600">
            {attentionCount > 0
              ? 'A few quick answers will help WriteOffs keep your records organized.'
              : processingComplete
                ? 'WriteOffs will keep working in the background.'
                : 'Some activity is still being processed.'}
          </p>
        </header>

        <div className="mt-7 flex flex-wrap items-start gap-x-5 gap-y-3">
          <ReceiptUploadAction />
          <Link href="/receipts" className="inline-flex min-h-12 items-center text-sm font-semibold text-[#243186] hover:underline">
            View receipts
          </Link>
          <Link href="/mileage" className="inline-flex min-h-12 items-center text-sm font-semibold text-[#243186] hover:underline">
            Add mileage
          </Link>
          <Link href="/money?kind=received" className="inline-flex min-h-12 items-center text-sm font-semibold text-[#243186] hover:underline">
            Record money received
          </Link>
          <Link href="/money?kind=spent" className="inline-flex min-h-12 items-center text-sm font-semibold text-[#243186] hover:underline">
            Record money spent
          </Link>
        </div>

        {needsOnboardingFollowUp && (
          <section className="mt-8 rounded-xl border border-indigo-200 bg-indigo-50 p-5" aria-labelledby="setup-heading">
            <h2 id="setup-heading" className="font-semibold text-slate-950">A few business details need an update</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">We’ll only ask for information that helps WriteOffs handle your records safely. Your existing work stays in place.</p>
            <Link href="/onboarding" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">Continue setup →</Link>
          </section>
        )}

        {questionCount > 0 && (
          <section aria-labelledby="attention-heading" className="mt-10 border-y border-slate-200 py-7 sm:mt-11">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="attention-heading" className="text-lg font-semibold text-slate-950">
                  Needs your attention
                </h2>
                <p className="mt-2 text-2xl font-medium tracking-[-0.02em] text-slate-900">
                  {customerQuestionHeadline(questionCount)}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  A few purchases need your input.
                </p>
              </div>
              <Link
                href="/questions"
                className="inline-flex min-h-11 items-center justify-center self-start rounded-md bg-[#243186] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#1d2870] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#243186] sm:self-center"
              >
                Answer questions <span aria-hidden="true" className="ml-2">→</span>
              </Link>
            </div>
          </section>
        )}

        {receiptAttentionCount > 0 && (
          <section aria-labelledby="receipt-attention-heading" className="border-b border-slate-200 py-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div>
              <h2 id="receipt-attention-heading" className="text-lg font-semibold text-slate-950">Receipts need your attention</h2>
              <p className="mt-2 text-sm text-slate-600">{receiptAttentionCount} uploaded {receiptAttentionCount === 1 ? 'receipt needs' : 'receipts need'} a quick decision.</p>
            </div><Link href="/receipts" className="text-sm font-semibold text-[#243186]">Handle receipts →</Link></div>
          </section>
        )}

        <section
          aria-labelledby="year-to-date-heading"
          className={`${attentionCount > 0 ? 'mt-10' : 'mt-11'} border-t border-slate-200 pt-8 sm:pt-9`}
        >
          <h2 id="year-to-date-heading" className="text-xs font-semibold tracking-[0.16em] text-slate-500">
            YEAR TO DATE
          </h2>
          <dl className="mt-5">
            {financialLines.map((line) => (
              <div
                key={line.label}
                className={`grid grid-cols-[1fr_auto] items-baseline gap-6 border-b border-slate-200 py-4 ${
                  line.emphasized ? 'mt-1 border-t border-t-slate-300' : ''
                }`}
              >
                <dt className={line.emphasized ? 'font-medium text-slate-950' : 'text-sm text-slate-700'}>
                  {line.label}
                </dt>
                <dd className={`${line.emphasized ? 'text-2xl font-semibold' : 'text-xl font-medium'} tabular-nums tracking-[-0.02em] text-slate-950`}>
                  {usd.format(line.value / 100)}
                </dd>
              </div>
            ))}
          </dl>
          {!summary.completeness.isComplete && (
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Some activity is still being processed.
            </p>
          )}
        </section>
      </div>
    </main>
  )
}
