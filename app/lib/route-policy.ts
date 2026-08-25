export const AUTHENTICATED_ROUTE_PREFIXES = [
  '/home',
  '/transactions',
  '/reports',
  '/settings',
  '/onboarding',
  '/questions',
  '/receipts',
  '/mileage',
  '/money',
  '/invoices',
  '/deductions',
  '/contractors',
  '/mfa',
  '/reset-password',
  '/import',
  '/membership',
  '/export',
  '/dashboard',
  '/review',
] as const

export function pathMatchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function isAuthenticatedRoute(pathname: string) {
  return AUTHENTICATED_ROUTE_PREFIXES.some((prefix) => pathMatchesPrefix(pathname, prefix))
}

export type ApplicationNavigationSection = 'home' | 'transactions' | 'reports' | 'account' | null

export function applicationNavigationSection(pathname: string): ApplicationNavigationSection {
  if (pathMatchesPrefix(pathname, '/home') || pathMatchesPrefix(pathname, '/invoices')
    || pathMatchesPrefix(pathname, '/deductions')) return 'home'
  if (pathMatchesPrefix(pathname, '/transactions')) return 'transactions'
  if (pathMatchesPrefix(pathname, '/reports') || pathMatchesPrefix(pathname, '/export')) return 'reports'
  if (pathMatchesPrefix(pathname, '/settings')) return 'account'
  return null
}
