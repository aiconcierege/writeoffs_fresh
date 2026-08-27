import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { BettiIllustration, type BettiState } from '../components/BettiIllustration'
import { getAuthenticatedCanonicalReport } from '../lib/bookkeeping/reporting-service'
import { getAuthenticatedPotentialWriteoffs } from '../lib/bookkeeping/potential-writeoffs-service'
import { listCustomerQuestions } from '../lib/bookkeeping/customer-questions'
import { summarizeReceiptDocumentation } from '../lib/bookkeeping/receipt-workflow'
import { getCurrentCustomerWeeklyReview } from '../lib/bookkeeping/weekly-review'
import { loadCustomerEntitlements } from '../lib/membership/entitlements'
import { onboardingNeedsFollowUp, type OnboardingBusinessData } from '../lib/onboarding/progress'
import { HomeGreeting } from './HomeGreeting'
import { QuestionInvitation } from './QuestionInvitation'
import { WeeklyReview } from './WeeklyReview'
import { DocumentationStrip, FinancialRelationship, monthlyWriteoffRhythm, RecordIndex, WriteoffRhythm } from './HomeVisuals'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const recordAreas = [
  ['/transactions', 'Transactions', 'Review your activity', 'transactions'],
  ['/receipts', 'Receipts', 'See your documentation', 'receipts'],
  ['/mileage', 'Mileage', 'Keep business miles', 'mileage'],
  ['/contractors', 'Contractors', 'Keep W-9 facts together', 'contractors'],
  ['/deductions', 'Business details', 'Review facts WriteOffs remembers', 'deductions'],
  ['/reports', 'Reports', 'See the bigger picture', 'reports'],
] as const

function firstName(metadata: Record<string, unknown>) {
  const value = [metadata.first_name, metadata.full_name, metadata.name]
    .find((item) => typeof item === 'string' && item.trim())
  return typeof value === 'string' ? value.trim().split(/\s+/)[0].slice(0, 60) : null
}

export default async function HomePage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const membership = await loadCustomerEntitlements(supabase)
  if (membership.lifecycle === 'none') redirect('/membership')
  if (membership.lifecycle === 'expired_read_only') redirect('/membership/read-only')

  const isBusiness = membership.plan === 'business'
  const today = new Date().toISOString().slice(0, 10)
  const year = today.slice(0, 4)
  const businessResult = await supabase.from('businesses').select('business_description,business_profile_context,schedule_c_eligibility,business_stage,business_start_month,uses_customer_job_materials,keeps_future_sale_merchandise,prior_materials_handling,catch_up_start_date,onboarding_start_method,v1_support_status,onboarding_state,onboarding_version')
    .eq('owner_user_id', user.id).maybeSingle()
  const [summary, potential, questions, receiptWorkflow, weeklyReview, cadenceResult] = await Promise.all([
    getAuthenticatedCanonicalReport({ supabase, periodStart: `${year}-01-01`, periodEnd: today, currency: 'USD' }),
    getAuthenticatedPotentialWriteoffs({ supabase, periodStart: `${year}-01-01`, periodEnd: today }),
    listCustomerQuestions({ supabase, scope: membership.plan! }),
    summarizeReceiptDocumentation(supabase),
    getCurrentCustomerWeeklyReview(supabase),
    supabase.from('current_business_review_cadence').select('timezone_name').maybeSingle(),
  ])
  if (cadenceResult.error || !cadenceResult.data?.timezone_name) {
    throw new Error('Your business timezone could not be loaded safely.')
  }

  const needsSetup = businessResult.data
    ? onboardingNeedsFollowUp(businessResult.data as OnboardingBusinessData) : true
  const areas = isBusiness
    ? [...recordAreas, ['/invoices', 'Invoices', 'Create or review invoices', 'invoices'] as const]
    : recordAreas
  const months = monthlyWriteoffRhythm(potential.items, Number(year))
  const documented = potential.items.filter((item) => item.hasEvidence).length
  const undocumented = potential.count - documented
  const bettiState: BettiState = questions.length > 0
    ? 'question' : receiptWorkflow.processing > 0 ? 'working' : 'caught-up'

  return <main className="home-page"><div className="home-shell">
    <HomeGreeting firstName={firstName(user.user_metadata ?? {})} timeZone={cadenceResult.data.timezone_name}/>

    <section className="home-hero" aria-labelledby="home-heading">
      <div className="home-writeoff-story">
        <p className="home-kicker">Your year with WriteOffs</p>
        <h1 id="home-heading"><strong>{potential.count}</strong><span>potential {potential.count === 1 ? 'writeoff' : 'writeoffs'}<br/>found this year</span></h1>
        <p className="home-story-copy">We’re keeping your business expenses organized and documented as you go.</p>
        <WriteoffRhythm months={months}/>
      </div>
      <div className={`home-betti home-betti-${bettiState}`}>
        <div className="home-betti-copy">
          {questions.length > 0
            ? <><p className="home-betti-title">{questions.length > 8 ? 'I have a few things I need your help with.' : `I have ${questions.length} quick ${questions.length === 1 ? 'question' : 'questions'} for you.`}</p><p>Is now a good time?</p>{questions.length > 8 && <span className="sr-only">There are {questions.length} questions in your continuous question queue.</span>}</>
            : receiptWorkflow.processing > 0
              ? <><p className="home-betti-title">I’m working on it.</p><p>{receiptWorkflow.processing} {receiptWorkflow.processing === 1 ? 'receipt is' : 'receipts are'} still being organized.</p></>
              : <><p className="home-betti-title">You’re all caught up.</p><p>I’ve got the rest.</p></>}
        </div>
        <BettiIllustration state={bettiState} priority className="home-betti-image" sizes="(max-width: 639px) 12rem, 22rem" decorative/>
        <div className="home-betti-actions">{questions.length > 0
          ? <QuestionInvitation count={questions.length} compact/>
          : <Link href="/transactions" className="home-inline-link">See what I’ve handled <span aria-hidden="true">→</span></Link>}</div>
      </div>
    </section>

    {weeklyReview && <WeeklyReview review={weeklyReview}/>}

    <section className="home-dashboard-row" aria-label="Documentation and recent work">
      <div className="home-documentation">
        <div className="home-section-heading"><div><p className="home-kicker">Documentation</p><h2>Your receipts stay with your expenses.</h2></div><Link href="/receipts">See receipts <span aria-hidden="true">→</span></Link></div>
        <DocumentationStrip documented={documented} undocumented={undocumented} processing={receiptWorkflow.processing}/>
        <p className="home-help-copy">A missing receipt doesn’t automatically make an expense invalid.</p>
      </div>
      <div className="home-recent-work">
        <p className="home-kicker">WriteOffs at work</p><h2>What I’m handling</h2>
        <ul>
          <li><span>✓</span><strong>{potential.count} potential writeoffs identified</strong></li>
          <li><span>✓</span><strong>{documented} receipts connected to expenses</strong></li>
          {receiptWorkflow.processing > 0 && <li><span className="home-work-dot">•</span><strong>{receiptWorkflow.processing} still being organized</strong></li>}
          {questions.length > 0 && <li><span className="home-work-question">?</span><strong>{questions.length} waiting for a fact from you</strong></li>}
        </ul>
      </div>
    </section>

    <section className="home-financial" aria-labelledby="financial-heading">
      <div className="home-section-heading"><div><p className="home-kicker">Your business at a glance</p><h2 id="financial-heading">The year so far</h2></div><Link href="/reports">See reports <span aria-hidden="true">→</span></Link></div>
      <FinancialRelationship business={isBusiness} income={summary.businessIncomeCents} expenses={summary.businessExpensesCents} profit={summary.businessProfitCents}/>
      {!isBusiness && <p className="home-help-copy">Income is outside your Expenses membership scope.</p>}
    </section>

    <section className="home-records" aria-labelledby="records-heading">
      <div className="home-section-heading"><div><p className="home-kicker">Your records</p><h2 id="records-heading">Find what you need.</h2></div></div>
      <RecordIndex areas={areas}/>
    </section>

    {needsSetup && <section className="home-setup"><div><p className="home-kicker">One more thing</p><h2>A few business details still need an update.</h2></div><Link href="/onboarding" className="btn btn-primary">Continue setup</Link></section>}
  </div></main>
}
