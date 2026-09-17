import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { loadCustomerEntitlements } from '../../../lib/membership/entitlements'
import { loadBettiWork } from '../../../lib/bookkeeping/betti-work-loader'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const db = await createServerSupabase()
  const { data: { user }, error } = await db.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: assurance } = await db.auth.mfa.getAuthenticatorAssuranceLevel()
  if (assurance?.currentLevel !== 'aal2') return NextResponse.json({ error: 'MFA required' }, { status: 403 })
  try {
    const membership = await loadCustomerEntitlements(db)
    if (!membership.businessId || membership.lifecycle === 'none')
      return NextResponse.json({ error: 'Membership required' }, { status: 403 })
    const record = new URL(request.url).searchParams.get('record')
    if (record && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record))
      return NextResponse.json({ error: 'Invalid context' }, { status: 400 })
    const projection = await loadBettiWork({ db, businessId: membership.businessId, scope: membership.plan ?? 'expenses',
      continuityRecordId: record ?? undefined, processingEnabled: process.env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED !== 'false' })
    return NextResponse.json({ ...projection, actionsEnabled: membership.capabilities.has('autonomous_processing') },
      { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Betti’s work summary is temporarily unavailable. Please try again.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
