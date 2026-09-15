import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { getCurrentAskableQuestionQueue } from '../../../lib/bookkeeping/customer-questions'
import{loadCustomerEntitlements}from'../../../lib/membership/entitlements'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const membership=await loadCustomerEntitlements(supabase)
    const queue = await getCurrentAskableQuestionQueue({ supabase,scope:membership.plan??'expenses' })
    return NextResponse.json(queue, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to load questions.' }, { status: 500 })
  }
}
