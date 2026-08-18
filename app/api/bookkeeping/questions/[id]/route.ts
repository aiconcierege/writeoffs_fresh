import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../utils/supabase/server'
import {
  actOnCustomerQuestion,
  type CustomerQuestionAction,
} from '../../../../lib/bookkeeping/customer-question-actions'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseCommand(value: unknown): CustomerQuestionAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  const keys = Object.keys(body).sort()
  if (body.action === 'defer' || body.action === 'not_sure') {
    return keys.join(',') === 'action' ? { action: body.action } : null
  }
  if (body.action === 'business_use' && (body.use === 'business' || body.use === 'personal')) {
    return keys.join(',') === 'action,use' ? { action: body.action, use: body.use } : null
  }
  if (body.action === 'business_purpose' && typeof body.businessPurpose === 'string') {
    return keys.join(',') === 'action,businessPurpose'
      ? { action: body.action, businessPurpose: body.businessPurpose }
      : null
  }
  if (body.action === 'mixed_all_business') {
    return keys.join(',') === 'action' ? { action: body.action } : null
  }
  if (
    body.action === 'mixed_personal_amount' &&
    typeof body.personalAmountCents === 'number' &&
    Number.isSafeInteger(body.personalAmountCents)
  ) {
    return keys.join(',') === 'action,personalAmountCents'
      ? { action: body.action, personalAmountCents: body.personalAmountCents }
      : null
  }
  if (body.action === 'factual_choice' && typeof body.optionId === 'string') {
    return keys.join(',') === 'action,optionId'
      ? { action: body.action, optionId: body.optionId }
      : null
  }
  return null
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { id } = await context.params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const command = parseCommand(body)
  const expectedEventId = request.headers.get('if-match')
  if (!UUID.test(id) || !expectedEventId || !UUID.test(expectedEventId) || !command) {
    return NextResponse.json({ error: 'invalid question action' }, { status: 400 })
  }
  try {
    await actOnCustomerQuestion({ supabase, issueId: id, expectedEventId, command })
    return NextResponse.json({ ok: true })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to save that answer.'
    const stale = /changed|latest question|stale/i.test(message)
    return NextResponse.json({
      error: stale
        ? 'This question changed. Please continue with the latest question.'
        : 'We couldn’t save that answer. Please check it and try again.',
    }, { status: stale ? 409 : 400 })
  }
}
