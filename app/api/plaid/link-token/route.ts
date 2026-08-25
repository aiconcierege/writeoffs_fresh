import { NextResponse } from 'next/server'
import { getAuthenticatedContext, unauthorizedResponse } from '../../../lib/auth/require-user'
import { createPlaidLinkToken } from '../../../lib/plaid/service'
import { getLimit, membershipErrorResponse, requireCapability } from '../../../lib/membership/entitlements'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return unauthorizedResponse()
  try {
    const body = await request.json().catch(() => ({})) as { itemId?: unknown }
    if (body.itemId != null && typeof body.itemId !== 'string') {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }
    const membership=await requireCapability(supabase,'track_expenses')
    if(!body.itemId){const count=await supabase.from('plaid_items').select('id',{count:'exact',head:true})
      .neq('connection_status','disconnected').eq('consent_status','active')
      if(count.error)throw new Error('CONNECTION_COUNT_UNAVAILABLE')
      const limit=getLimit(membership,'connected_plaid_item_limit')
      if((count.count??0)>=limit)return NextResponse.json({error:'connection_limit',message:membership.plan==='expenses'
        ?`Your Expenses membership includes ${limit} bank connections. Upgrade to Business to add another.`
        :`Your Business membership currently includes ${limit} bank connections.`},{status:403})}
    const result = await createPlaidLinkToken({ supabase, itemRecordId: body.itemId ?? null })
    return NextResponse.json({ linkToken: result.link_token, expiration: result.expiration }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (cause) {
    if(cause instanceof Error&&cause.message.startsWith('MEMBERSHIP_')){const denied=membershipErrorResponse(cause);return NextResponse.json({error:'membership_required',message:denied.error},{status:denied.status})}
    return NextResponse.json({ error: 'temporarily_unavailable', message: 'Bank connection setup is unavailable right now.' }, { status: 503 })
  }
}
