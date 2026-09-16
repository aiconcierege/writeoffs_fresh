/** Only known local workflow routes may become return destinations. No network URLs. */
export function safeReturnTo(value: unknown, fallback = '/transactions'): string {
  if (typeof value !== 'string' || value.length > 2400 || /[\\\r\n]/.test(value) || !value.startsWith('/') || value.startsWith('//')) return fallback
  try {
    const url = new URL(value, 'https://writeoffs.invalid')
    if (url.origin !== 'https://writeoffs.invalid' || !/^\/(?:transactions(?:\/[0-9a-f-]{36})?|home|reports(?:\/tax-time)?|check-in|receipts)$/.test(url.pathname)) return fallback
    return url.pathname + url.search
  } catch { return fallback }
}
export function returnLabel(destination: string) {
  return destination.startsWith('/transactions/') ? 'Back to transaction' : destination.startsWith('/transactions') ? 'Transactions'
    : destination.startsWith('/reports') ? 'Reports' : destination.startsWith('/check-in') ? 'Check-in' : destination.startsWith('/receipts') ? 'Receipts' : 'Home'
}
export function withReturnTo(destination: string, origin: string) {
  const url = new URL(destination, 'https://writeoffs.invalid')
  url.searchParams.set('returnTo', safeReturnTo(origin))
  return url.pathname + url.search
}
