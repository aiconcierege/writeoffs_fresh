import Link from'next/link'
import {hasDeferredBookkeepingWork} from '../lib/onboarding/deferred-work'
import{redirect}from'next/navigation'
import{createServerSupabase}from'../../utils/supabase/server'
import{getAuthenticatedCanonicalReport}from'../lib/bookkeeping/reporting-service'
import{summarizeReceiptDocumentation}from'../lib/bookkeeping/receipt-workflow'
import{getCurrentAskableQuestionQueue}from'../lib/bookkeeping/customer-questions'
import{getHomeOperatingStatus}from'../lib/home/operating-status'
import{getHomeRecentActivity}from'../lib/home/recently-handled'
import{customerFirstName,projectBettiHome,timeOfDayGreeting}from'../lib/home/betti-home'
import{loadCustomerEntitlements}from'../lib/membership/entitlements'
import{onboardingNeedsFollowUp,type OnboardingBusinessData}from'../lib/onboarding/progress'
import{HomeOperatingStatus}from'./HomeOperatingStatus'
import{FinancialRelationship}from'./HomeVisuals'
import{HomeQuickActions}from'./HomeQuickActions'
import{HomeBettiHero}from'./HomeBettiHero'
import{HomeRecentActivity}from'./HomeRecentActivity'

export const dynamic='force-dynamic';export const runtime='nodejs'
export default async function HomePage(){
 const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login')
 const membership=await loadCustomerEntitlements(supabase);if(membership.lifecycle==='none')redirect('/membership');if(membership.lifecycle==='expired_read_only')redirect('/membership/read-only')
 const isBusiness=membership.plan==='business',today=new Date().toISOString().slice(0,10),year=today.slice(0,4),yearStart=`${year}-01-01`
 const businessResult=await supabase.from('businesses').select('business_description,business_profile_context,schedule_c_eligibility,business_stage,business_start_month,uses_customer_job_materials,keeps_future_sale_merchandise,prior_materials_handling,catch_up_start_date,onboarding_start_method,v1_support_status,onboarding_state,onboarding_version')
  .eq('owner_user_id',user.id).maybeSingle()
 const coveredStart=businessResult.data?.catch_up_start_date&&businessResult.data.catch_up_start_date>yearStart?businessResult.data.catch_up_start_date:yearStart
 const[summary,receiptWorkflow,questionQueue,operatingStatus,recentActivity]=await Promise.all([
  getAuthenticatedCanonicalReport({supabase,periodStart:coveredStart,periodEnd:today,currency:'USD'}),
  summarizeReceiptDocumentation(supabase),
  getCurrentAskableQuestionQueue({supabase,scope:membership.plan!}),getHomeOperatingStatus(supabase),getHomeRecentActivity(supabase,user.id,coveredStart,today),
 ])
 const betti=projectBettiHome({name:customerFirstName(user.user_metadata),
  greeting:timeOfDayGreeting(new Date(),operatingStatus.timeZone),askableQuestionCount:questionQueue.count,
  hasDeferredWork:membership.businessId?await hasDeferredBookkeepingWork(supabase,membership.businessId):false,receiptsProcessing:receiptWorkflow.processing,receiptsNeedHelp:receiptWorkflow.needsHelp,
  outstandingDocumentation:receiptWorkflow.outstandingDocumentation,historicalMileageNeedsAttention:summary.completeness.historicalMileageNeedsAttention})
 const needsSetup=businessResult.data?onboardingNeedsFollowUp(businessResult.data as OnboardingBusinessData):true
 return <main className="home-page"><div className="home-shell">
  <HomeBettiHero projection={betti}/>

  <section className="home-financial home-business-snapshot" aria-labelledby="financial-heading"><div className="home-section-heading"><div><p className="home-kicker">Your business</p><h2 id="financial-heading">Year to date</h2><p>{['needs-customer','attention'].includes(betti.state)?'Based on the bookkeeping Betti has safely completed so far.':'Kept up to date by Betti from the records currently available.'}</p></div><Link href="/reports">See reports <span aria-hidden="true">→</span></Link></div><FinancialRelationship business={isBusiness} income={summary.businessIncomeCents} expenses={summary.businessExpensesCents} profit={summary.businessProfitCents}/>{!isBusiness&&<p className="home-help-copy">Your Expenses membership organizes business spending. Income and profit are outside its reporting scope.</p>}</section>

  {summary.businessMilesMilli>0&&<section className="home-follow-up" aria-labelledby="home-mileage-heading"><div><h2 id="home-mileage-heading">Business mileage</h2><p className="mt-3 text-2xl font-semibold">{new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(summary.businessMilesMilli/1000)} miles</p>{summary.mileageDeductionCents!=null?<><p className="mt-2">{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(summary.mileageDeductionCents/100)} mileage expense</p><p className="mt-2 text-sm text-[#59665f]">Included in your business expenses.</p></>:<p className="mt-2 text-sm text-[#59665f]">Your miles are saved. A few vehicle details are still needed to calculate the expense.</p>}</div><Link href="/mileage" className="font-semibold text-[#243186]">See mileage →</Link></section>}
  <HomeOperatingStatus status={operatingStatus} outstandingDocumentation={receiptWorkflow.outstandingDocumentation}/>
  <HomeRecentActivity activity={recentActivity}/>
  <HomeQuickActions business={isBusiness}/>

  {needsSetup&&<section className="home-setup"><div><p className="home-kicker">One more thing</p><h2>A few business details still need an update.</h2></div><Link href="/onboarding" className="btn btn-primary">Continue setup</Link></section>}
 </div></main>
}
