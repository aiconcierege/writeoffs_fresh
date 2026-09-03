import Link from'next/link'
import{redirect}from'next/navigation'
import{createServerSupabase}from'../../utils/supabase/server'
import{getAuthenticatedCanonicalReport}from'../lib/bookkeeping/reporting-service'
import{getAuthenticatedPotentialWriteoffs}from'../lib/bookkeeping/potential-writeoffs-service'
import{summarizeReceiptDocumentation}from'../lib/bookkeeping/receipt-workflow'
import{listCustomerWeeklyReviews}from'../lib/bookkeeping/weekly-review'
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
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})

export default async function HomePage(){
 const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login')
 const membership=await loadCustomerEntitlements(supabase);if(membership.lifecycle==='none')redirect('/membership');if(membership.lifecycle==='expired_read_only')redirect('/membership/read-only')
 const isBusiness=membership.plan==='business',today=new Date().toISOString().slice(0,10),year=today.slice(0,4),yearStart=`${year}-01-01`
 const businessResult=await supabase.from('businesses').select('business_description,business_profile_context,schedule_c_eligibility,business_stage,business_start_month,uses_customer_job_materials,keeps_future_sale_merchandise,prior_materials_handling,catch_up_start_date,onboarding_start_method,v1_support_status,onboarding_state,onboarding_version')
  .eq('owner_user_id',user.id).maybeSingle()
 const coveredStart=businessResult.data?.catch_up_start_date&&businessResult.data.catch_up_start_date>yearStart?businessResult.data.catch_up_start_date:yearStart
 const[summary,potential,receiptWorkflow,reviews,operatingStatus,recentActivity]=await Promise.all([
  getAuthenticatedCanonicalReport({supabase,periodStart:coveredStart,periodEnd:today,currency:'USD'}),
  getAuthenticatedPotentialWriteoffs({supabase,periodStart:coveredStart,periodEnd:today}),summarizeReceiptDocumentation(supabase),
  listCustomerWeeklyReviews(supabase),getHomeOperatingStatus(supabase),getHomeRecentActivity(supabase,user.id,coveredStart,today),
 ])
 const actionable=reviews.filter(review=>review.actionable)
 const betti=projectBettiHome({name:customerFirstName(user.user_metadata),
  greeting:timeOfDayGreeting(new Date(),operatingStatus.timeZone),actionableReviewIds:actionable.map(review=>review.id),
  receiptsProcessing:receiptWorkflow.processing,receiptsNeedHelp:receiptWorkflow.needsHelp,
  outstandingDocumentation:receiptWorkflow.outstandingDocumentation})
 const needsSetup=businessResult.data?onboardingNeedsFollowUp(businessResult.data as OnboardingBusinessData):true
 const potentialCents=potential.items.reduce((sum,item)=>sum+item.businessAmountCents,0)
 return <main className="home-page"><div className="home-shell">
  <HomeBettiHero projection={betti}/>

  <section className="home-financial home-business-snapshot" aria-labelledby="financial-heading"><div className="home-section-heading"><div><p className="home-kicker">Your business</p><h2 id="financial-heading">Year to date</h2><p>{['needs-customer','attention'].includes(betti.state)?'Based on the bookkeeping Betti has safely completed so far.':'Kept up to date by Betti from the records currently available.'}</p></div><Link href="/reports">See reports <span aria-hidden="true">→</span></Link></div><FinancialRelationship business={isBusiness} income={summary.businessIncomeCents} expenses={summary.businessExpensesCents} profit={summary.businessProfitCents}/>{!isBusiness&&<p className="home-help-copy">Your Expenses membership organizes business spending. Income and profit are outside its reporting scope.</p>}</section>

  <HomeOperatingStatus status={operatingStatus} outstandingDocumentation={receiptWorkflow.outstandingDocumentation}/>
  <HomeQuickActions business={isBusiness}/>

  <section className="home-value" aria-labelledby="home-value-heading"><div><p className="home-kicker">What Betti has found</p><h2 id="home-value-heading"><strong>{money.format(potentialCents/100)}</strong><span>Potential writeoffs found in {year}</span></h2><p>Based on the business expenses currently in your WriteOffs records. This is not an estimate of tax savings or a refund.</p></div></section>

  <HomeRecentActivity activity={recentActivity}/>

  {needsSetup&&<section className="home-setup"><div><p className="home-kicker">One more thing</p><h2>A few business details still need an update.</h2></div><Link href="/onboarding" className="btn btn-primary">Continue setup</Link></section>}
 </div></main>
}
