import Link from'next/link'
import{redirect}from'next/navigation'
import{createServerSupabase}from'../../utils/supabase/server'
import{BettiIllustration,type BettiState}from'../components/BettiIllustration'
import{getAuthenticatedCanonicalReport}from'../lib/bookkeeping/reporting-service'
import{getAuthenticatedPotentialWriteoffs}from'../lib/bookkeeping/potential-writeoffs-service'
import{summarizeReceiptDocumentation}from'../lib/bookkeeping/receipt-workflow'
import{listCustomerWeeklyReviews}from'../lib/bookkeeping/weekly-review'
import{getHomeOperatingStatus}from'../lib/home/operating-status'
import{getRecentlyHandled}from'../lib/home/recently-handled'
import{loadCustomerEntitlements}from'../lib/membership/entitlements'
import{onboardingNeedsFollowUp,type OnboardingBusinessData}from'../lib/onboarding/progress'
import{HomeOperatingStatus}from'./HomeOperatingStatus'
import{FinancialRelationship}from'./HomeVisuals'
import{HomeAskBetti}from'./HomeAskBetti'
import{HomeQuickActions}from'./HomeQuickActions'
import{HomeReviewInvitation}from'./HomeReviewInvitation'

export const dynamic='force-dynamic';export const runtime='nodejs'
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})

export default async function HomePage(){
 const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login')
 const membership=await loadCustomerEntitlements(supabase);if(membership.lifecycle==='none')redirect('/membership');if(membership.lifecycle==='expired_read_only')redirect('/membership/read-only')
 const isBusiness=membership.plan==='business',today=new Date().toISOString().slice(0,10),year=today.slice(0,4),yearStart=`${year}-01-01`
 const businessResult=await supabase.from('businesses').select('business_description,business_profile_context,schedule_c_eligibility,business_stage,business_start_month,uses_customer_job_materials,keeps_future_sale_merchandise,prior_materials_handling,catch_up_start_date,onboarding_start_method,v1_support_status,onboarding_state,onboarding_version')
  .eq('owner_user_id',user.id).maybeSingle()
 const coveredStart=businessResult.data?.catch_up_start_date&&businessResult.data.catch_up_start_date>yearStart?businessResult.data.catch_up_start_date:yearStart
 const[summary,potential,receiptWorkflow,reviews,operatingStatus,recent]=await Promise.all([
  getAuthenticatedCanonicalReport({supabase,periodStart:coveredStart,periodEnd:today,currency:'USD'}),
  getAuthenticatedPotentialWriteoffs({supabase,periodStart:coveredStart,periodEnd:today}),summarizeReceiptDocumentation(supabase),
  listCustomerWeeklyReviews(supabase),getHomeOperatingStatus(supabase),getRecentlyHandled(supabase,user.id,coveredStart,today),
 ])
 const actionable=reviews.filter(review=>review.actionable),waitingCount=actionable.length
 const bettiState:BettiState=waitingCount>0?'question':receiptWorkflow.processing>0?'working':'caught-up'
 const needsSetup=businessResult.data?onboardingNeedsFollowUp(businessResult.data as OnboardingBusinessData):true
 const potentialCents=potential.items.reduce((sum,item)=>sum+item.businessAmountCents,0)
 return <main className="home-page"><div className="home-shell">
  <section className={`home-agent-hero home-agent-${bettiState}`} aria-labelledby="home-heading">
   <div className="home-agent-copy"><p className="home-kicker">Your books with WriteOffs</p>
    <h1 id="home-heading">{waitingCount>0?'Your books need your attention.':bettiState==='working'?'I’m still working on your books.':'Your books are up to date.'}</h1>
    <p>{waitingCount>0?`I’ve done everything I can for now. ${waitingCount===1?'One weekly review is':`${waitingCount} weekly reviews are`} waiting for you.`:bettiState==='working'?`${receiptWorkflow.processing} ${receiptWorkflow.processing===1?'receipt is':'receipts are'} still being organized. You don’t need to wait here.`:'I’ll keep working in the background.'}</p>
    {waitingCount>0&&actionable.length>0&&<HomeReviewInvitation count={waitingCount}/>}<HomeOperatingStatus status={operatingStatus}/>
   </div>
   <BettiIllustration state={bettiState} priority className="home-agent-betti" sizes="(max-width: 639px) 15rem, 28rem" decorative/>
  </section>

  <section className="home-value" aria-labelledby="home-value-heading"><div><p className="home-kicker">Value found</p><h2 id="home-value-heading"><strong>{money.format(potentialCents/100)}</strong><span>Potential writeoffs found in {year}</span></h2><p>Based on the business expenses currently in your WriteOffs records. This is not an estimate of tax savings or a refund.</p></div></section>

  <section className="home-financial" aria-labelledby="financial-heading"><div className="home-section-heading"><div><p className="home-kicker">Your business picture</p><h2 id="financial-heading">The year so far</h2></div><Link href="/reports">See reports <span aria-hidden="true">→</span></Link></div><FinancialRelationship business={isBusiness} income={summary.businessIncomeCents} expenses={summary.businessExpensesCents} profit={summary.businessProfitCents}/>{!isBusiness&&<p className="home-help-copy">Your Expenses membership organizes business spending. Income and profit are outside its reporting scope.</p>}</section>

  <div className="home-tools"><HomeQuickActions business={isBusiness}/><HomeAskBetti/></div>

  <section className="home-recent" aria-labelledby="home-recent-heading"><div className="home-section-heading"><div><p className="home-kicker">Recently handled</p><h2 id="home-recent-heading">Work already moving forward</h2></div><Link href="/transactions">View transactions <span aria-hidden="true">→</span></Link></div>{recent.length?<ul>{recent.map(item=><li key={item.id}><Link href={item.href}><strong>{item.merchant}</strong><span>{item.outcome}</span><i aria-hidden="true">→</i></Link></li>)}</ul>:<p className="home-recent-empty">I’ll show recent bookkeeping work here as records are handled.</p>}</section>

  {needsSetup&&<section className="home-setup"><div><p className="home-kicker">One more thing</p><h2>A few business details still need an update.</h2></div><Link href="/onboarding" className="btn btn-primary">Continue setup</Link></section>}
 </div></main>
}
