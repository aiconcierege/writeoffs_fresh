import { hasPlaidMfa } from '../../../lib/plaid/mfa'
import { NextResponse } from 'next/server'
import { getAuthenticatedContext, unauthorizedResponse } from '../../../lib/auth/require-user'
import { createPlaidLinkToken } from '../../../lib/plaid/service'
import { getLimit, membershipErrorResponse, requireCapability } from '../../../lib/membership/entitlements'

export const runtime = 'nodejs'

// Never log SDK errors: they may contain credential-bearing request headers.
function linkFailureCode(cause: unknown) {
  const known: Record<string, string> = {
    CONNECTION_COUNT_UNAVAILABLE: 'CONNECTION_COUNT_UNAVAILABLE',
    BUSINESS_NOT_FOUND: 'BUSINESS_NOT_FOUND',
    AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
    'Plaid Link is not enabled in this environment.': 'LINK_DISABLED',
    'Plaid is not enabled in this environment.': 'PLAID_DISABLED',
    'Plaid server credentials are unavailable.': 'PLAID_CREDENTIALS_UNAVAILABLE',
  }
  if (cause instanceof Error && known[cause.message]) return known[cause.message]
  const data = (cause as { response?: { data?: { error_code?: unknown; error_message?: unknown } } } | null)?.response?.data
  const code = data?.error_code
  if (code === 'INVALID_FIELD' && typeof data?.error_message === 'string') {
    // Identify only fixed diagnostics; never log provider-supplied text or values.
    if (/redirect/i.test(data.error_message) && /allow|register|dashboard/i.test(data.error_message)) return 'REDIRECT_URI_NOT_REGISTERED'
    for (const field of ['redirect_uri', 'webhook', 'days_requested', 'client_user_id', 'account_filters', 'products']) {
      if (data.error_message.toLowerCase().includes(field) || (field === 'redirect_uri' && /redirect/i.test(data.error_message))) return `INVALID_FIELD_${field.toUpperCase()}`
    }
  }
  const providerCodes = ['INVALID_FIELD', 'INVALID_CONFIGURATION', 'INVALID_API_KEYS', 'INVALID_PRODUCT', 'INVALID_ENVIRONMENT', 'MISSING_FIELDS', 'UNAUTHORIZED_ROUTE_ACCESS', 'INTERNAL_SERVER_ERROR']
  return typeof code === 'string' && providerCodes.includes(code) ? code : 'LINK_REQUEST_FAILED'
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return unauthorizedResponse()
  if (!await hasPlaidMfa(supabase)) return NextResponse.json({ error: 'verification_required', message: 'Verify your identity to manage your bank connection.' }, { status: 403 })
  try {
    const body = await request.json().catch(() => ({})) as { itemId?: unknown }
    if (body.itemId != null && typeof body.itemId !== 'string') {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }
    const membership=await requireCapability(supabase,'track_expenses')
    if(!body.itemId){
      // Items contain credentials and intentionally deny customer table access.
      // The existing owner-scoped RPC exposes only safe connection metadata.
      const connections=await supabase.rpc('list_plaid_connections')
      if(connections.error || !Array.isArray(connections.data))throw new Error('CONNECTION_COUNT_UNAVAILABLE')
      const count=connections.data.filter((item: {connection_status:string;consent_status:string})=>
        item.connection_status!=='disconnected'&&item.consent_status==='active').length
      const limit=getLimit(membership,'connected_plaid_item_limit')
      if(count>=limit)return NextResponse.json({error:'connection_limit',message:membership.plan==='expenses'
        ?`Your Expenses membership includes ${limit} bank connections. Upgrade to Business to add another.`
        :`Your Business membership currently includes ${limit} bank connections.`},{status:403})}
    const result = await createPlaidLinkToken({ supabase, itemRecordId: body.itemId ?? null })
    return NextResponse.json({ linkToken: result.link_token, expiration: result.expiration, updateVersion: 'updateVersion' in result ? result.updateVersion : undefined }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (cause) {
    if(cause instanceof Error&&cause.message.startsWith('MEMBERSHIP_')){const denied=membershipErrorResponse(cause);return NextResponse.json({error:'membership_required',message:denied.error},{status:denied.status})}
    console.warn('plaid_link_initialization_failed', { code: linkFailureCode(cause) })
    return NextResponse.json({ error: 'temporarily_unavailable', message: 'Bank connection setup is unavailable right now.' }, { status: 503 })
  }
}
