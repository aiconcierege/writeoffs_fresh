export type AccountUseDesignation = 'business_only' | 'business_and_personal'
export type AccountUseRequest = { designation: AccountUseDesignation; effectiveAt: string; requestId: string }
const eventId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** A selected control is not a saved fact. Only the canonical API's event confirms it. */
export async function persistAccountUse(accountId: string, request: AccountUseRequest): Promise<string> {
  const response = await fetch(`/api/bookkeeping/accounts/${accountId}/use`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request), keepalive: true,
  })
  const body = await response.json().catch(() => null) as { ok?: boolean; eventId?: string } | null
  if (!response.ok || body?.ok !== true || !eventId.test(body.eventId ?? '')) {
    throw new Error('This choice has not been confirmed. Please try again.')
  }
  return body!.eventId!
}
