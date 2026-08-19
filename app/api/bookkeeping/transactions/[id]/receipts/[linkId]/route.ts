import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../../../utils/supabase/server'
import { resolveFinancialTransactionRecord } from '../../../../../../lib/bookkeeping/financial-transaction-workflow'
import { CanonicalBookkeepingService } from '../../../../../../lib/bookkeeping/service'
import { SupabaseBookkeepingRepository } from '../../../../../../lib/bookkeeping/supabase-repository'

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; linkId: string }> }) {
  const supabase = await createServerSupabase(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id, linkId } = await context.params
  try {
    const resolved = await resolveFinancialTransactionRecord({ supabase, financialTransactionId: id })
    const { data: link } = await supabase.from('bookkeeping_document_links')
      .select('receipt_id').eq('id', linkId).eq('business_id', resolved.record.businessId)
      .eq('bookkeeping_record_id', resolved.record.id).is('revoked_at', null).maybeSingle()
    if (!link) return NextResponse.json({ error: 'Receipt link not found.' }, { status: 404 })
    const service = new CanonicalBookkeepingService(new SupabaseBookkeepingRepository(supabase))
    await service.revokeReceiptLink({ actor: { businessId: resolved.record.businessId,
      userId: user.id, provenance: 'user' }, recordId: resolved.record.id,
      receiptId: link.receipt_id, reason: 'Customer removed this receipt from the transaction.' })
    return NextResponse.json({ ok: true })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to remove receipt.'
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 400 })
  }
}
