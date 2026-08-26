/* File: proxy.ts
 * Version: v2
 * Date: 2025-10-13
 * Notes: Opens signup in staging, keeps production waitlist-only, and keeps Supabase auth cookies in sync.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isAuthenticatedRoute } from './app/lib/route-policy'
import { mfaEnforcementMode } from './app/lib/auth/mfa-policy'
import { isCustomerSignupEnabled } from './app/lib/auth/signup-policy'
import { nextRequiredCustomerDestination } from './app/lib/auth/prerequisite-policy'
import { onboardingNeedsFollowUp, type OnboardingBusinessData } from './app/lib/onboarding/progress'

function redirectWithRefreshedAuthCookies(url: URL, response: NextResponse) {
  const redirectResponse = NextResponse.redirect(url)
  for (const cookie of response.cookies.getAll()) redirectResponse.cookies.set(cookie)
  return redirectResponse
}

export async function proxy(req: NextRequest) {
  const url = req.nextUrl
  const pathname = url.pathname
  const res = NextResponse.next()

  // --- Keep Supabase auth cookies in sync for server components ---
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    let mfaSatisfied = mode === 'off'
    let mfaFactorEnrolled = false
    if (mode !== 'off') {
      const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      mfaSatisfied = assurance?.currentLevel === 'aal2'
      mfaFactorEnrolled = assurance?.nextLevel === 'aal2'
    }
    const [{ data: membership }, { data: business }, { data: cadence }] = mfaSatisfied
      ? await Promise.all([
        supabase.from('current_customer_membership').select('lifecycle').maybeSingle(),
        supabase.from('businesses').select('business_description,business_profile_context,schedule_c_eligibility,business_stage,business_start_month,uses_customer_job_materials,keeps_future_sale_merchandise,prior_materials_handling,catch_up_start_date,onboarding_start_method,v1_support_status,onboarding_state,onboarding_version').eq('owner_user_id', user.id).maybeSingle(),
        supabase.from('current_business_review_cadence').select('id').maybeSingle(),
      ]) : [{ data: null }, { data: null }, { data: null }]
    const destination = nextRequiredCustomerDestination({
      mfaSatisfied,
      mfaFactorEnrolled,
      membershipLifecycle: membership?.lifecycle ?? null,
      onboardingComplete: Boolean(business && !onboardingNeedsFollowUp(business as OnboardingBusinessData)),
      getStartedComplete: Boolean(cadence),
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
