import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../utils/supabase/server'
import { loadCustomerEntitlements } from '../../../../lib/membership/entitlements'

/** Explicit command, never invoked by a report/read projection. RPCs preserve
 * existing ownership, current-evidence, idempotency and customer-answer guards. */
export async function POST() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (assurance?.currentLevel !== 'aal2') return NextResponse.json({ error: 'verification_required' }, { status: 403 })
  const membership = await loadCustomerEntitlements(supabase)
  if (!membership.capabilities.has('autonomous_processing'))
    return NextResponse.json({ error: 'membership_required' }, { status: 403 })
  for (const command of ['ensure_current_money_in_questions', 'ensure_current_meal_substantiation_questions',
    'ensure_current_receipt_meal_candidate_questions']) {
    const { error } = await supabase.rpc(command)
    if (error) return NextResponse.json({ error: 'Questions could not be refreshed. Please try again.' }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}
