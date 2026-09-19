/* File: proxy.ts
 * Version: v2
 * Date: 2025-10-13
 * Notes: Opens signup in staging, keeps production waitlist-only, and keeps Supabase auth cookies in sync.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isAuthenticatedRoute,isCustomerBookkeepingMutationRoute,indexedHandlerOwnsAuthentication } from './app/lib/route-policy'
import { mfaEnforcementMode } from './app/lib/auth/mfa-policy'
import { isCustomerSignupEnabled } from './app/lib/auth/signup-policy'
import { nextRequiredCustomerDestination } from './app/lib/auth/prerequisite-policy'
import { onboardingNeedsFollowUp, type OnboardingBusinessData } from './app/lib/onboarding/progress'
import { hasStagingTestMfaBypass } from './app/lib/auth/staging-test-user'

function redirectWithRefreshedAuthCookies(url: URL, response: NextResponse) {
  const redirectResponse = NextResponse.redirect(url)
  for (const cookie of response.cookies.getAll()) redirectResponse.cookies.set(cookie)
  return redirectResponse
}

export async function proxy(req:NextRequest){
  const timing={started:performance.now(),calls:0,transportMs:0}
  const response=await runProxy(req,timing)
  if(process.env.WRITEOFFS_ENVIRONMENT==='staging'){
    response.headers.set('X-Betti-Proxy-Ms',(performance.now()-timing.started).toFixed(1))
    response.headers.set('X-Betti-Proxy-Calls',String(timing.calls))
    response.headers.set('X-Betti-Proxy-Transport-Ms',timing.transportMs.toFixed(1))
  }
  return response
}

async function runProxy(req: NextRequest,timing:{started:number;calls:number;transportMs:number}) {
  const url = req.nextUrl
  const pathname = url.pathname
  const res = NextResponse.next()

  if(indexedHandlerOwnsAuthentication(pathname,req.method,
    process.env.WRITEOFFS_ENVIRONMENT==='staging'&&process.env.BETTI_ACTION_INDEX_ENABLED!=='false'))return res

  // --- Keep Supabase auth cookies in sync for server components ---
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global:{fetch:async(input,init)=>{
        const start=performance.now();timing.calls++
        try{return await fetch(input,init)}finally{timing.transportMs+=performance.now()-start}
      }},
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: (name: string, value: string, options: any) => {
          res.cookies.set({ name, value, ...options })
        },
        remove: (name: string, options: any) => {
          res.cookies.set({ name, value: '', ...options, maxAge: 0 })
        }
      }
    }
  )
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))

  if(user&&isCustomerBookkeepingMutationRoute(pathname,req.method)){
    const{data:membership}=await supabase.from('current_customer_membership').select('lifecycle,deletion_status,access_through,grace_through').maybeSingle()
    const now=Date.now(),access=membership?.access_through?new Date(membership.access_through).getTime():Infinity,grace=membership?.grace_through?new Date(membership.grace_through).getTime():0
    const active=membership&&!membership.deletion_status&&((['active','canceling'].includes(membership.lifecycle)&&access>now)||(membership.lifecycle==='payment_issue'&&grace>now))
    if(!active)return NextResponse.json({error:'Your records are view-only. You can still view and download them.'},{status:403})
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    url.pathname = '/home'
    url.search = ''
    return redirectWithRefreshedAuthCookies(url, res)
  }

  const signupEnabled = isCustomerSignupEnabled()
  if (!signupEnabled && pathname.startsWith('/signup')) {
    url.pathname = '/'
    url.searchParams.set('waitlist', '1')
    return redirectWithRefreshedAuthCookies(url, res)
  }

  if (!user && isAuthenticatedRoute(pathname)) {
    url.pathname = '/login'
    url.search = ''
    return redirectWithRefreshedAuthCookies(url, res)
  }

  if (user && isAuthenticatedRoute(pathname)) {
    const mode = mfaEnforcementMode()
    const stagingTestBypass = hasStagingTestMfaBypass(user.email)
    let mfaSatisfied = mode === 'off' || stagingTestBypass
    let mfaFactorEnrolled = false
    if (mode !== 'off' && !stagingTestBypass) {
      const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      mfaSatisfied = assurance?.currentLevel === 'aal2'
      mfaFactorEnrolled = assurance?.nextLevel === 'aal2'
    }
    const [{ data: membership }, { data: business }] = mfaSatisfied
      ? await Promise.all([
        supabase.from('current_customer_membership').select('lifecycle').maybeSingle(),
        supabase.from('businesses').select('business_description,business_profile_context,schedule_c_eligibility,business_stage,business_start_month,uses_customer_job_materials,keeps_future_sale_merchandise,prior_materials_handling,catch_up_start_date,onboarding_start_method,v1_support_status,onboarding_state,onboarding_version').eq('owner_user_id', user.id).maybeSingle(),
      ]) : [{ data: null }, { data: null }]
    const destination = nextRequiredCustomerDestination({
      mfaSatisfied,
      mfaFactorEnrolled,
      membershipLifecycle: membership?.lifecycle ?? null,
      onboardingComplete: Boolean(business && !onboardingNeedsFollowUp(business as OnboardingBusinessData)),
    }, `${pathname}${req.nextUrl.search}`)
    if (destination) {
      const target = new URL(destination, req.url)
      return redirectWithRefreshedAuthCookies(target, res)
    }
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|assets|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)'
  ]
}
