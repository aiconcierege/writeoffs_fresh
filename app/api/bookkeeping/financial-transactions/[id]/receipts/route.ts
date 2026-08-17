import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../../utils/supabase/server'
import { attachReceiptToFinancialTransaction } from '../../../../../lib/bookkeeping/receipt-matching-workflow'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const { id } = await context.params
  const receiptId =
    body && typeof body === 'object' && 'receipt_id' in body
      ? (body as { receipt_id?: unknown }).receipt_id
      : null
  if (!UUID.test(id) || typeof receiptId !== 'string' || !UUID.test(receiptId)) {
    return NextResponse.json(
      { error: 'valid financial transaction and receipt ids are required' },
      { status: 400 }
    )
  }

  try {
    const result = await attachReceiptToFinancialTransaction({
      supabase,
      financialTransactionId: id,
      receiptId,
    })
    return NextResponse.json({
      ok: true,
      bookkeeping_record_id: result.record.id,
      document_link_id: result.link.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unable to attach receipt'
    const status = /not found for this Business/i.test(message) ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
