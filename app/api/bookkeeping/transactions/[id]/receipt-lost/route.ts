import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../../utils/supabase/server'
import { resolveFinancialTransactionRecord } from '../../../../../lib/bookkeeping/financial-transaction-workflow'
import { markReceiptLost } from '../../../../../lib/bookkeeping/documentation-events'
import { SupabaseBookkeepingRepository } from '../../../../../lib/bookkeeping/supabase-repository'

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await context.params
  try {
    const resolved = await resolveFinancialTransactionRecord({ supabase, financialTransactionId: id })
    const requests = await new SupabaseBookkeepingRepository(supabase)
      .listOutstandingDocumentationRequests(resolved.record.businessId)
    const request = requests.find((event) => event.bookkeepingRecordId === resolved.record.id)
    if (!request) return NextResponse.json({ error: 'No receipt request needs an answer.' }, { status: 409 })
    await markReceiptLost({ supabase, issueId: request.documentationIssueId,
      expectedCurrentEventId: request.id,
      expectedContextFingerprint: request.contextFingerprint,
      expectedEvidenceFingerprint: request.evidenceFingerprint ?? '',
      answer: { schemaVersion: 1, assertion: 'receipt_lost' } })
    return NextResponse.json({ ok: true })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to record receipt status.'
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 400 })
  }
}
