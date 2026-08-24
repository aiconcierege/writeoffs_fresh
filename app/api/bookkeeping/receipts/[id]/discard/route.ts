import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../../utils/supabase/server'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const supabase = await createServerSupabase()
    const requestKey = request.headers.get('idempotency-key') ?? crypto.randomUUID()
    const { data: result, error } = await supabase.rpc('discard_autonomous_bookkeeping_receipt', {
      p_receipt_id: id, p_request_key: requestKey, p_reason: 'Customer removed receipt from current records.',
    })
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, result })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to discard receipt.'
    return NextResponse.json({ error: message }, { status: /authenticated/.test(message) ? 401 : 400 })
  }
}
