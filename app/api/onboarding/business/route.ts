import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { validateOnboardingBusinessPatch } from '../../../lib/onboarding/validation'
import { ACCOUNTING_SENSITIVE_BUSINESS_FACTS } from '../../../lib/onboarding/validation'

export async function PATCH(request: Request) {
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

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'request is invalid' }, { status: 400 })
  }
  const payload = body as Record<string, unknown>
  const validation = validateOnboardingBusinessPatch({ step: payload.step, data: payload.data })
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const { data: business, error: lookupError } = await supabase
    .from('businesses')
    .select('id, onboarding_state, business_profile_context')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 400 })
  }
  if (!business) {
    return NextResponse.json(
      { error: 'business profile is unavailable' },
      { status: 409 }
    )
  }

  const update = {
    ...Object.fromEntries(Object.entries(validation.update).filter(
      ([key]) => !ACCOUNTING_SENSITIVE_BUSINESS_FACTS.includes(key as typeof ACCOUNTING_SENSITIVE_BUSINESS_FACTS[number])
    )),
    onboarding_state:
      business.onboarding_state === 'completed' ? 'completed' : 'in_progress',
    onboarding_version: 3,
    // The legacy compatibility column remains populated for database completion
    // checks, but is no longer a customer-selected product mode.
    ...(validation.step === 'business' && business.business_profile_context == null
      ? { business_profile_context: 'general' }
      : {}),
  }

  const sensitiveChanges = Object.fromEntries(Object.entries(validation.update).filter(
    ([key]) => ACCOUNTING_SENSITIVE_BUSINESS_FACTS.includes(key as typeof ACCOUNTING_SENSITIVE_BUSINESS_FACTS[number])
  ))
  const hasSensitiveChanges = Object.keys(sensitiveChanges).length > 0
  const factSource = payload.source === 'settings' ? 'settings' : 'onboarding'
  let factRevisions: Record<string, string> = {}
  if (hasSensitiveChanges) {
    if (typeof payload.request_id !== 'string' || payload.request_id.length < 1 || payload.request_id.length > 120
      || typeof payload.expected_fact_event_ids !== 'object' || payload.expected_fact_event_ids === null
      || Array.isArray(payload.expected_fact_event_ids)) {
      return NextResponse.json({ error: 'Business fact revision context is required' }, { status: 400 })
    }
    const { data: revisions, error: factError } = await supabase.rpc('record_business_fact_changes', {
      p_business_id: business.id,
      p_changes: sensitiveChanges,
      p_expected_event_ids: payload.expected_fact_event_ids,
      p_source: factSource,
      p_reason: business.onboarding_state === 'completed'
        ? 'Customer corrected Business setup facts.'
        : 'Customer answered Business setup questions.',
      p_request_key: payload.request_id,
    })
    if (factError) {
      const stale = factError.message.includes('changed before this answer')
      return NextResponse.json({ error: stale ? 'business facts changed' : factError.message }, { status: stale ? 409 : 400 })
    }
    factRevisions = (revisions ?? {}) as Record<string, string>
  }

  if (!hasSensitiveChanges) {
    const { error: updateError, count } = await supabase
      .from('businesses')
      .update(update, { count: 'exact' })
      .eq('id', business.id)
      .eq('owner_user_id', user.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }
    if (count !== 1) {
      return NextResponse.json(
        { error: 'business profile is unavailable' },
        { status: 409 }
      )
    }
  }

  return NextResponse.json({ ok: true, step: validation.step, factRevisions })
}
