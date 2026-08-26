import { safeAuthenticatedNext } from './mfa-policy'

export type CustomerPrerequisiteState = {
  mfaSatisfied: boolean
  mfaFactorEnrolled: boolean
  membershipLifecycle: string | null
  onboardingComplete: boolean
  getStartedComplete: boolean
}

const accountRoutes = ['/settings/security', '/settings/billing']
const getStartedSupportRoutes = ['/get-started', '/settings/banking', '/receipts', '/import']

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function allowed(pathname: string, routes: readonly string[]) {
  return routes.some((route) => matches(pathname, route))
}

function continuation(requested: string) {
  return safeAuthenticatedNext(requested, '/home')
}

/** One authoritative ordering for authenticated customer setup prerequisites. */
export function nextRequiredCustomerDestination(
  state: CustomerPrerequisiteState,
  requestedPathAndSearch: string,
) {
  const safeRequested = safeAuthenticatedNext(requestedPathAndSearch, '/home')
  const requestedUrl = new URL(safeRequested, 'https://writeoffs.invalid')
  const pathname = requestedUrl.pathname
  const next = continuation(`${pathname}${requestedUrl.search}`)

  if (!state.mfaSatisfied) {
    if (state.mfaFactorEnrolled) {
      if (pathname === '/mfa/challenge') return null
      return `/mfa/challenge?next=${encodeURIComponent(next)}`
    }
    if (pathname === '/settings/security') return null
    return `/settings/security?enroll=required&next=${encodeURIComponent(next)}`
  }

  if (state.membershipLifecycle === 'expired_read_only') {
    if (pathname === '/membership/read-only' || allowed(pathname, accountRoutes)) return null
    return '/membership/read-only'
  }

  const hasActiveMembership = ['active', 'payment_issue', 'canceling'].includes(state.membershipLifecycle ?? '')
  if (!hasActiveMembership) {
    if (pathname === '/membership' || pathname.startsWith('/membership?') || allowed(pathname, accountRoutes)) return null
    return '/membership'
  }

  if (!state.onboardingComplete) {
    if (pathname === '/onboarding' || allowed(pathname, accountRoutes)) return null
    return '/onboarding'
  }

  if (!state.getStartedComplete) {
    if (allowed(pathname, [...getStartedSupportRoutes, ...accountRoutes])) return null
    return '/get-started'
  }

  return null
}
