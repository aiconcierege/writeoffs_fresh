export const AUTHENTICATED_ROUTE_PREFIXES = [
  '/home',
  '/get-started',
  '/transactions',
  '/reports',
  '/settings',
  '/onboarding',
  '/questions',
  '/check-in',
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
  '/weekly-review',
] as const

export function pathMatchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function isAuthenticatedRoute(pathname: string) {
  return AUTHENTICATED_ROUTE_PREFIXES.some((prefix) => pathMatchesPrefix(pathname, prefix))
}

const CUSTOMER_BOOKKEEPING_MUTATION_PREFIXES=['/api/bookkeeping/','/api/receipts','/api/plaid/link-token','/api/plaid/exchange','/api/plaid/sync','/api/mileage','/api/manual-money','/api/invoices','/api/import','/api/documents','/api/deductions','/api/contractors','/api/tx/'] as const
export function isCustomerBookkeepingMutationRoute(pathname:string,method:string){return !['GET','HEAD','OPTIONS'].includes(method.toUpperCase())&&CUSTOMER_BOOKKEEPING_MUTATION_PREFIXES.some(prefix=>pathname===prefix||pathname.startsWith(prefix))}

export type ApplicationNavigationSection = 'home' | 'transactions' | 'reports' | 'account' | null

export function applicationNavigationSection(pathname: string): ApplicationNavigationSection {
  if (pathMatchesPrefix(pathname, '/home') || pathMatchesPrefix(pathname, '/invoices')
    || pathMatchesPrefix(pathname, '/deductions')) return 'home'
  if (pathMatchesPrefix(pathname, '/transactions')) return 'transactions'
  if (pathMatchesPrefix(pathname, '/reports') || pathMatchesPrefix(pathname, '/export')) return 'reports'
  if (pathMatchesPrefix(pathname, '/settings')) return 'account'
  return null
}
