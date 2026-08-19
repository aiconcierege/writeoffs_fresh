import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../../utils/supabase/server'
import { completeUnmatchedReceipt } from '../../../../../lib/bookkeeping/receipt-workflow'

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const result = await completeUnmatchedReceipt({ supabase: await createServerSupabase(), receiptId: id, action: 'discard' })
    return NextResponse.json({ ok: true, result })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to discard receipt.'
    return NextResponse.json({ error: message }, { status: /authenticated/.test(message) ? 401 : 400 })
  }
}
