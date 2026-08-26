import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../../utils/supabase/server'
import { correctCanonicalTransactionUse } from '../../../../../lib/bookkeeping/transaction-corrections'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await context.params
  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const keys=Object.keys(body).sort().join(',')
  const review=body.reviewContext as Record<string,unknown>|undefined
  if (!UUID.test(id) || !UUID.test(String(body.expectedCurrentDecisionId ?? ''))
    || !UUID.test(String(body.correctionRequestId ?? ''))
    || !['answer,correctionRequestId,expectedCurrentDecisionId','answer,correctionRequestId,expectedCurrentDecisionId,reviewContext'].includes(keys)
    || (review&&(!UUID.test(String(review.reviewPeriodId??''))||!UUID.test(String(review.reviewSnapshotId??''))
      ||!UUID.test(String(review.expectedReviewEventId??''))))) {
    return NextResponse.json({ error: 'invalid correction request' }, { status: 400 })
  }
  try {
    const result = await correctCanonicalTransactionUse({ supabase,
      financialTransactionId: id,
      expectedCurrentDecisionId: String(body.expectedCurrentDecisionId),
      correctionRequestId: String(body.correctionRequestId), answer: body.answer })
    if(review){const linked=await supabase.rpc('link_weekly_review_correction',{
      p_review_period_id:review.reviewPeriodId,p_review_snapshot_id:review.reviewSnapshotId,
      p_expected_review_event_id:review.expectedReviewEventId,p_prior_decision_id:body.expectedCurrentDecisionId,
      p_resulting_decision_id:(result as Record<string,unknown>).decision_id,p_correction_request_id:body.correctionRequestId})
      if(linked.error)throw new Error('The correction was saved, but the weekly review changed. Refresh Home.')}
    return NextResponse.json({ ok: true, result })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to save correction.'
    const stale = /stale/i.test(message)
    return NextResponse.json({ error: stale ? 'This transaction changed. Refresh and try again.' : message },
      { status: stale ? 409 : 400 })
  }
}
