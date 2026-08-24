import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { customerQuestionHeadline } from '../lib/bookkeeping/customer-questions'
import { getAuthenticatedCanonicalReport } from '../lib/bookkeeping/reporting-service'
import { HomeGreeting } from './HomeGreeting'
import { countReceiptsNeedingAttention } from '../lib/bookkeeping/receipt-workflow'
import { onboardingNeedsFollowUp, type OnboardingBusinessData } from '../lib/onboarding/progress'
import { ReceiptUploadAction } from '../receipts/ReceiptUploadAction'
import { getAuthenticatedTaxYearReadiness } from '../lib/bookkeeping/tax-year-readiness-service'
import { MoneyDisplay, StatusBadge } from '../components/ui'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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
  const readiness = await getAuthenticatedTaxYearReadiness({ supabase, taxYear: Number(periodEnd.slice(0, 4)) })
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
    <main className="app-page">
      <div className="page-container max-w-5xl">
        <header className="max-w-2xl">
          <HomeGreeting firstName={firstName} />
          <h1 className="mt-3 text-[2.35rem] font-semibold leading-[1.05] tracking-[-0.045em] text-[#17211d] sm:text-5xl">
            {attentionCount > 0
              ? `${attentionCount} ${attentionCount === 1 ? 'thing needs' : 'things need'} your attention.`
              : processingComplete
                ? 'Your books are up to date.'
                : 'WriteOffs is working.'}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[#59665f]">
            {attentionCount > 0
              ? 'A few quick answers will help WriteOffs keep your records organized.'
              : processingComplete
                ? 'WriteOffs will keep working in the background.'
                : 'Some activity is still being processed.'}
          </p>
        </header>

        <div className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-3">
          <ReceiptUploadAction />
          <Link href="/mileage" className="btn btn-quiet">
            Add mileage
          </Link>
          <Link href="/money?kind=received" className="btn btn-quiet">
            Record money received
          </Link>
          <Link href="/money?kind=spent" className="btn btn-quiet">
            Record money spent
          </Link>
          <details className="group relative"><summary className="btn btn-quiet cursor-pointer list-none [&::-webkit-details-marker]:hidden">More <span aria-hidden="true">＋</span></summary>
            <div className="absolute left-0 z-20 mt-2 grid min-w-52 rounded-xl border border-[#dce3de] bg-white p-2 shadow-[0_18px_45px_rgba(23,33,29,.14)]">
              <Link href="/invoices" className="rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-slate-50">Create invoice</Link><Link href="/receipts" className="rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-slate-50">View receipts</Link><Link href="/deductions" className="rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-slate-50">Deduction details</Link><Link href="/contractors" className="rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-slate-50">Contractor details</Link>
            </div></details>
        </div>

        {needsOnboardingFollowUp && (
          <section className="notice mt-9" aria-labelledby="setup-heading">
            <h2 id="setup-heading" className="font-semibold text-slate-950">A few business details need an update</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">We’ll only ask for information that helps WriteOffs handle your records safely. Your existing work stays in place.</p>
            <Link href="/onboarding" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">Continue setup →</Link>
          </section>
        )}

        {questionCount > 0 && (
          <section aria-labelledby="attention-heading" className="mt-11 rounded-2xl bg-[#eef7f2] px-5 py-7 sm:px-7">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="attention-heading" className="text-lg font-semibold text-slate-950">
                  Needs your attention
                </h2>
                <p className="mt-2 text-2xl font-medium tracking-[-0.02em] text-slate-900">
                  {customerQuestionHeadline(questionCount)}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  A few business details need your input.
                </p>
              </div>
              <Link
                href="/questions"
                className="btn btn-primary self-start sm:self-center"
              >
                Answer questions <span aria-hidden="true" className="ml-2">→</span>
              </Link>
            </div>
          </section>
        )}

        {receiptAttentionCount > 0 && (
          <section aria-labelledby="receipt-attention-heading" className="border-b border-[#dce3de] py-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div>
              <h2 id="receipt-attention-heading" className="text-lg font-semibold text-slate-950">Receipts need your attention</h2>
              <p className="mt-2 text-sm text-slate-600">{receiptAttentionCount} uploaded {receiptAttentionCount === 1 ? 'receipt needs' : 'receipts need'} a quick decision.</p>
            </div><Link href="/receipts" className="text-sm font-semibold text-[#243186]">Handle receipts →</Link></div>
          </section>
        )}

        <section aria-labelledby="tax-readiness-heading" className="border-b border-[#dce3de] py-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div>
            <div className="flex items-center gap-3"><h2 id="tax-readiness-heading" className="text-lg font-semibold text-slate-950">{readiness.taxYear} records</h2><StatusBadge tone={readiness.status === 'ready' ? 'positive' : readiness.status === 'still_processing' ? 'muted' : 'attention'}>{readiness.status.replace('_',' ')}</StatusBadge></div>
            <p className="mt-2 text-sm text-slate-600">{readiness.status === 'ready' ? 'Ready for tax preparation'
              : readiness.status === 'still_processing' ? 'WriteOffs is still working'
                : readiness.status === 'needs_attention' ? `${readiness.issues.length} ${readiness.issues.length === 1 ? 'thing needs' : 'things need'} attention`
                  : 'Information is needed before these records are ready'}</p>
          </div><Link href={`/reports/tax-time?year=${readiness.taxYear}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">View annual records →</Link></div>
        </section>

        <section
          aria-labelledby="year-to-date-heading"
          className={`${attentionCount > 0 ? 'mt-11' : 'mt-12'} border-t border-[#dce3de] pt-8 sm:pt-10`}
        >
          <h2 id="year-to-date-heading" className="text-xs font-semibold tracking-[0.16em] text-slate-500">
            YEAR TO DATE
          </h2>
          <dl className="mt-5 grid gap-x-10 sm:grid-cols-2">
            {financialLines.map((line) => (
              <div
                key={line.label}
                className={`border-b border-[#dce3de] py-5 ${
                  line.emphasized ? 'sm:col-span-2 sm:grid sm:grid-cols-[1fr_auto] sm:items-baseline' : ''
                }`}
              >
                <dt className={line.emphasized ? 'font-medium text-slate-950' : 'text-sm text-slate-700'}>
                  {line.label}
                </dt>
                <dd className={`${line.emphasized ? 'mt-2 text-4xl font-semibold sm:mt-0' : 'mt-2 text-3xl font-semibold'} money-display`}><MoneyDisplay cents={line.value} /></dd>
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
