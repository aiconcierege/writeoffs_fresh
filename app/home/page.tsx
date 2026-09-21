import {bankConnectionAttention} from '../lib/plaid/connection-attention'
import {BankConnectionNotice} from '../components/BankConnectionNotice'
import {SourceCoverageNotice} from '../components/SourceCoverageNotice'
import {loadSourceCoverage} from '../lib/bookkeeping/source-coverage-loader'
import {requestUser} from '../lib/performance/request-identity'
import {timedRender} from '../lib/performance/request-timing'
import {WorkRefresh} from '../components/WorkRefresh'
import './command-center.css'
import {loadBettiWork} from '../lib/bookkeeping/betti-work-loader'
import {homeCommand,unavailableHomeCommand} from '../lib/home/command-center'
import Link from'next/link'
import{redirect}from'next/navigation'
import{createServerSupabase}from'../../utils/supabase/server'
import{getAuthenticatedCanonicalReport}from'../lib/bookkeeping/reporting-service'
import{getHomeRecentActivity}from'../lib/home/recently-handled'
import{loadCustomerEntitlements}from'../lib/membership/entitlements'
import{onboardingNeedsFollowUp,type OnboardingBusinessData}from'../lib/onboarding/progress'
import{FinancialRelationship}from'./HomeVisuals'
import{HomeQuickActions}from'./HomeQuickActions'
import{HomeBettiHero}from'./HomeBettiHero'
import{HomeRecentActivity}from'./HomeRecentActivity'

export const dynamic='force-dynamic';export const runtime='nodejs'
async function HomePage(){
 const supabase=await createServerSupabase(),{data:{user}}=await requestUser(supabase);if(!user)redirect('/login')
 const membership=await loadCustomerEntitlements(supabase);if(membership.lifecycle==='none')redirect('/membership');if(membership.lifecycle==='expired_read_only')redirect('/membership/read-only')
 const isBusiness=membership.plan==='business',today=new Date().toISOString().slice(0,10),year=today.slice(0,4),yearStart=`${year}-01-01`
 const businessResult=await supabase.from('businesses').select('business_description,business_profile_context,schedule_c_eligibility,business_stage,business_start_month,uses_customer_job_materials,keeps_future_sale_merchandise,prior_materials_handling,catch_up_start_date,onboarding_start_method,v1_support_status,onboarding_state,onboarding_version')
  .eq('owner_user_id',user.id).maybeSingle()
 const coveredStart=businessResult.data?.catch_up_start_date&&businessResult.data.catch_up_start_date>yearStart?businessResult.data.catch_up_start_date:yearStart
 if(!membership.businessId)redirect('/membership')
 const needsSetup=businessResult.data?onboardingNeedsFollowUp(businessResult.data as OnboardingBusinessData):true
 if(needsSetup)redirect('/onboarding')
 const[summary,work,recentActivity,coverage,connections]=await Promise.all([
  getAuthenticatedCanonicalReport({supabase,periodStart:coveredStart,periodEnd:today,currency:'USD'}).catch(()=>{console.error('HOME_REPORT_UNAVAILABLE');return null}),
  loadBettiWork({db:supabase,businessId:membership.businessId,scope:membership.plan??'expenses',processingEnabled:process.env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED!=='false'})
   .catch(()=>{console.error('HOME_WORK_PROJECTION_UNAVAILABLE');return null}),
  getHomeRecentActivity(supabase,user.id,coveredStart,today).catch(()=>{console.error('HOME_RECENT_ACTIVITY_UNAVAILABLE');return null}),
  loadSourceCoverage(supabase).catch(()=>null),
  supabase.rpc('list_plaid_connections'),
 ])
 let betti=work?homeCommand(work,businessResult.data?.onboarding_start_method??null):unavailableHomeCommand
 if(coverage?.needsRecords&&betti.state==='caught-up')betti={...betti,state:'waiting',heading:'Your available records are organized.',supporting:'Send me statements for the missing months and I’ll work on those too.'}
 const dateLabel=(day:string)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${day}T00:00:00Z`))
 return <div className="home-page home-command-center wo-experience" data-customer-action-count={work?.customer.actionableCount}><WorkRefresh active={!work||Boolean(work.betti.jobs.length)||Boolean(connections.data?.some(bankConnectionAttention))}/><div className="home-shell">
  <HomeBettiHero projection={betti}/>
  <BankConnectionNotice connections={connections.data}/>
  <SourceCoverageNotice coverage={coverage}/>
  {betti.education&&<p className="home-first-use">{betti.education}</p>}

  <section className="home-financial home-business-snapshot" aria-labelledby="financial-heading"><div className="home-section-heading"><div><p className="home-kicker">Your business</p><h2 id="financial-heading">Your working books</h2><p>{dateLabel(coveredStart)} – {dateLabel(today)}</p></div><Link href="/reports">See reports <span aria-hidden="true">→</span></Link></div>{summary?<FinancialRelationship business={isBusiness} income={summary.businessIncomeCents} expenses={summary.businessExpensesCents} profit={summary.businessProfitCents}/>:<p role="status">Your totals aren’t available right now. Please try again in a moment.</p>}<p className="home-working-note">Based on the records available so far. Tax-time deductions are tracked separately.</p>{!isBusiness&&<p className="home-help-copy">Your Expenses membership organizes business spending. Income and profit are outside its reporting scope.</p>}</section>

  <HomeQuickActions business={isBusiness}/>
  {summary&&summary.businessMilesMilli>0&&<p className="home-mileage-summary"><Link href="/mileage">{new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(summary.businessMilesMilli/1000)} business miles recorded →</Link></p>}
  {recentActivity?<HomeRecentActivity activity={recentActivity}/>:<p role="status">Recent activity couldn’t load. <Link href="/transactions">View transactions</Link></p>}
 </div></div>
}

export default timedRender('HomePage',HomePage)
