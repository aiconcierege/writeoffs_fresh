import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { getAuthenticatedCanonicalReport } from '../lib/bookkeeping/reporting-service'
import { getAuthenticatedPotentialWriteoffs } from '../lib/bookkeeping/potential-writeoffs-service'
import { listCustomerQuestions } from '../lib/bookkeeping/customer-questions'
import { summarizeReceiptDocumentation } from '../lib/bookkeeping/receipt-workflow'
import { getCurrentCustomerWeeklyReview } from '../lib/bookkeeping/weekly-review'
import { loadCustomerEntitlements } from '../lib/membership/entitlements'
import { onboardingNeedsFollowUp, type OnboardingBusinessData } from '../lib/onboarding/progress'
import { MoneyDisplay } from '../components/ui'
import { HomeGreeting } from './HomeGreeting'
import { QuestionInvitation } from './QuestionInvitation'
import { WeeklyReview } from './WeeklyReview'

export const dynamic='force-dynamic'
export const runtime='nodejs'

const recordAreas=[
  ['/transactions','Transactions','See the activity WriteOffs has organized.'],
  ['/receipts','Receipts','Send receipts and see what they support.'],
  ['/mileage','Mileage','Keep the miles from your business driving.'],
  ['/contractors','Contractors','Keep payment and W-9 facts together.'],
  ['/deductions','Deduction details','Review the real-world facts WriteOffs uses.'],
  ['/reports','Reports','See your records for the year and tax time.'],
] as const

function firstName(metadata:Record<string,unknown>){const value=[metadata.first_name,metadata.full_name,metadata.name]
  .find((item)=>typeof item==='string'&&item.trim());return typeof value==='string'?value.trim().split(/\s+/)[0].slice(0,60):null}

export default async function HomePage(){
  const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/login')
  const membership=await loadCustomerEntitlements(supabase)
  if(membership.lifecycle==='none')redirect('/membership')
  if(membership.lifecycle==='expired_read_only')redirect('/membership/read-only')
  const isBusiness=membership.plan==='business',today=new Date().toISOString().slice(0,10),year=today.slice(0,4)
  const businessResult=await supabase.from('businesses').select('business_description,business_profile_context,schedule_c_eligibility,business_stage,business_start_month,uses_customer_job_materials,keeps_future_sale_merchandise,prior_materials_handling,catch_up_start_date,onboarding_start_method,v1_support_status,onboarding_state,onboarding_version')
    .eq('owner_user_id',user.id).maybeSingle()
  const [summary,potential,questions,documentation,weeklyReview]=await Promise.all([
    getAuthenticatedCanonicalReport({supabase,periodStart:`${year}-01-01`,periodEnd:today,currency:'USD'}),
    getAuthenticatedPotentialWriteoffs({supabase,periodStart:`${year}-01-01`,periodEnd:today}),
    listCustomerQuestions({supabase,scope:membership.plan!}),summarizeReceiptDocumentation(supabase),
    getCurrentCustomerWeeklyReview(supabase),
  ])
  const needsSetup=businessResult.data?onboardingNeedsFollowUp(businessResult.data as OnboardingBusinessData):true
  const areas=isBusiness?[...recordAreas,['/invoices','Invoices','Send invoices and keep their payment history.'] as const]:recordAreas
  return <main className="app-page"><div className="page-container max-w-5xl">
    <header className="max-w-3xl"><HomeGreeting firstName={firstName(user.user_metadata??{})}/>
      <h1 className="mt-4 text-[2.7rem] font-semibold leading-[.98] tracking-[-.052em] text-[#17211d] sm:text-[4.25rem]">
        We’ve found <span className="text-[#243186]">{potential.count}</span> potential {potential.count===1?'writeoff':'writeoffs'} this year.
      </h1><p className="mt-5 max-w-xl text-base leading-7 text-[#59665f]">We’re keeping them organized and documented as you go.</p>
      {questions.length>0?<QuestionInvitation count={questions.length}/>:<div className="mt-6"><p className="text-xl font-semibold">You’re all caught up.</p><p className="mt-1 text-[#59665f]">I’ll keep working in the background.</p></div>}
    </header>

    {weeklyReview&&<WeeklyReview review={weeklyReview}/>}
    {needsSetup&&<section className="mt-9 border-l-2 border-[#9ccdbc] pl-4"><h2 className="font-semibold">A few business details still need an update.</h2><Link href="/onboarding" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">Continue setup →</Link></section>}

    <section className="mt-14" aria-labelledby="documentation-heading"><p className="eyebrow">Documentation</p><h2 id="documentation-heading" className="mt-3 text-2xl font-semibold tracking-[-.03em]">Your records are staying together.</h2>
      <div className="mt-6 grid gap-x-8 border-y border-[#dce3de] sm:grid-cols-3"><div className="py-5"><p className="text-3xl font-semibold">{documentation.organized}</p><p className="mt-1 text-sm text-[#59665f]">receipts organized</p></div><div className="border-t border-[#dce3de] py-5 sm:border-l sm:border-t-0 sm:pl-8"><p className="text-3xl font-semibold">{documentation.processing}</p><p className="mt-1 text-sm text-[#59665f]">still being worked on</p></div><div className="border-t border-[#dce3de] py-5 sm:border-l sm:border-t-0 sm:pl-8"><p className="text-3xl font-semibold">{documentation.needsHelp}</p><p className="mt-1 text-sm text-[#59665f]">need your help</p></div></div>
      <p className="mt-4 text-sm leading-6 text-[#59665f]">A missing receipt does not automatically make an expense invalid. <Link href="/receipts" className="font-semibold text-[#243186]">See receipts →</Link></p>
    </section>

    <section className="mt-16" aria-labelledby="records-heading"><p className="eyebrow">Your records</p><h2 id="records-heading" className="mt-3 text-3xl font-semibold tracking-[-.035em]">Everything WriteOffs is keeping for you.</h2>
      <nav aria-label="Business records" className="mt-6 grid border-t border-[#dce3de] sm:grid-cols-2">{areas.map(([href,title,description])=><Link key={href} href={href} className="group border-b border-[#dce3de] py-6 pr-5 sm:odd:mr-8"><span className="flex items-center justify-between text-lg font-semibold"><span>{title}</span><span aria-hidden="true" className="text-[#243186] transition group-hover:translate-x-1">→</span></span><span className="mt-2 block text-sm leading-6 text-[#59665f]">{description}</span></Link>)}</nav>
    </section>

    <section className="mt-16 border-t border-[#dce3de] pt-9" aria-labelledby="financial-heading"><p className="eyebrow">Year to date</p><h2 id="financial-heading" className="mt-3 text-2xl font-semibold">A simple look at the numbers.</h2>
      <dl className="mt-6 grid gap-x-10 sm:grid-cols-3">{isBusiness&&<div className="border-b border-[#dce3de] py-5"><dt className="text-sm text-[#59665f]">Business income</dt><dd className="money-display mt-2 text-3xl font-semibold"><MoneyDisplay cents={summary.businessIncomeCents}/></dd></div>}<div className="border-b border-[#dce3de] py-5"><dt className="text-sm text-[#59665f]">Business expenses</dt><dd className="money-display mt-2 text-3xl font-semibold"><MoneyDisplay cents={summary.businessExpensesCents}/></dd></div>{isBusiness&&<div className="border-b border-[#dce3de] py-5"><dt className="text-sm text-[#59665f]">Estimated business profit</dt><dd className="money-display mt-2 text-3xl font-semibold"><MoneyDisplay cents={summary.businessProfitCents}/></dd></div>}</dl>
      <Link href="/reports" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">See reports →</Link>
    </section>
  </div></main>
}
