import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../../utils/supabase/server'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  if (Object.keys(body).sort().join(',') !== 'merchant,occurredOn,totalAmountCents' ||
      typeof body.merchant !== 'string' || !body.merchant.trim() || body.merchant.trim().length > 500 ||
      typeof body.occurredOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.occurredOn) ||
      !Number.isSafeInteger(body.totalAmountCents) || (body.totalAmountCents as number) <= 0) {
    return NextResponse.json({ error: 'valid merchant, date, and receipt total are required' }, { status: 400 })
  }
  const { id } = await context.params
  const { data, error } = await supabase.rpc('keep_unmatched_bookkeeping_receipt_with_facts', {
    p_receipt_id: id, p_merchant: body.merchant.trim(), p_occurred_on: body.occurredOn,
    p_total_amount_cents: body.totalAmountCents,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, result: data })
}
