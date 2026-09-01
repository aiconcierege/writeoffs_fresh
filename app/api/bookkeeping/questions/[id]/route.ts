import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../utils/supabase/server'
import {
  actOnCustomerQuestion,
  type CustomerQuestionAction,
} from '../../../../lib/bookkeeping/customer-question-actions'
import { createServerAdminSupabase } from '../../../../../utils/supabase/admin'
import { loadBookkeepingEvaluationSnapshot } from '../../../../lib/bookkeeping/evaluation-snapshot'
import { runDeductionIntelligenceForRecord } from '../../../../lib/bookkeeping/deduction-intelligence'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseCommand(value: unknown): CustomerQuestionAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  const keys = Object.keys(body).sort()
  if (body.action === 'defer' || body.action === 'not_sure') {
    return keys.join(',') === 'action' ? { action: body.action } : null
  }
  if (body.action === 'business_use' && (body.use === 'business' || body.use === 'personal' || body.use === 'mixed')) {
    return keys.join(',') === 'action,use' ? { action: body.action, use: body.use } : null
  }
  if (body.action === 'business_purpose' && typeof body.businessPurpose === 'string') {
    return keys.join(',') === 'action,businessPurpose'
      ? { action: body.action, businessPurpose: body.businessPurpose }
      : null
  }
  if (body.action === 'meal_relationship' && typeof body.attendeeRelationship === 'string') {
    return keys.join(',') === 'action,attendeeRelationship'
      ? { action: body.action, attendeeRelationship: body.attendeeRelationship }
      : null
  }
  if (body.action === 'mixed_all_business') {
    return keys.join(',') === 'action' ? { action: body.action } : null
  }
  if (
    body.action === 'mixed_business_amount' &&
    typeof body.businessAmountCents === 'number' &&
    Number.isSafeInteger(body.businessAmountCents)
  ) {
    return keys.join(',') === 'action,businessAmountCents'
      ? { action: body.action, businessAmountCents: body.businessAmountCents }
      : null
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
  if (body.action === 'mixed_business_percentage' && typeof body.businessPercentage === 'string'
    && /^(100(?:\.0{1,2})?|(?:[0-9]|[1-9][0-9])(?:\.[0-9]{1,2})?)$/.test(body.businessPercentage)) {
    return keys.join(',') === 'action,businessPercentage'
      ? { action: body.action, businessPercentage: body.businessPercentage } : null
  }
  if (body.action === 'factual_choice' && typeof body.optionId === 'string') {
    return keys.join(',') === 'action,optionId'
      ? { action: body.action, optionId: body.optionId }
      : null
  }
  if(body.action==='transaction_type'&&typeof body.activity==='string'){
    const allowed=['purchase','earned_money','moved_money','paid_card','received_refund','added_own_money','borrowed_money','other']
    if(!allowed.includes(body.activity))return null
    if(body.activity==='other')return keys.join(',')==='action,activity,details'&&typeof body.details==='string'
      ?{action:'transaction_type',activity:'other',details:body.details}:null
    return keys.join(',')==='action,activity'?{action:'transaction_type',activity:body.activity as Exclude<import('../../../../lib/bookkeeping/review-answer-model').TransactionTypeAnswer['activity'],'other'>}:null
  }
  if (body.action === 'deduction_fact' && (typeof body.value === 'number'
    || typeof body.value === 'boolean' || typeof body.value === 'string')) {
    return keys.join(',') === 'action,value'
      ? { action: body.action, value: body.value } as CustomerQuestionAction : null
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
    if (command.action === 'defer') {
      const [{ data: contractorPayment }, { data: contractorW9 }] = await Promise.all([
        supabase.from('current_contractor_payments').select('id').eq('id', id).maybeSingle(),
        supabase.from('current_contractor_w9_status').select('id').eq('id', id).maybeSingle(),
      ])
      if (contractorPayment || contractorW9) return NextResponse.json({ ok: true })
    }
    if (command.action === 'factual_choice') {
      const [{ data: contractorPayment }, { data: contractorW9 }] = await Promise.all([
        supabase.from('current_contractor_payments').select('*').eq('id', id).maybeSingle(),
        supabase.from('current_contractor_w9_status').select('*').eq('id', id).maybeSingle(),
      ])
      if (contractorPayment) {
        const allowed = ['cash','check','ach_zelle','payment_card','third_party_service','other']
        if (!allowed.includes(command.optionId)) throw new Error('That payment method is unavailable.')
        const { error: paymentError } = await supabase.rpc('associate_contractor_payment', {
          p_bookkeeping_record_id: contractorPayment.bookkeeping_record_id,
          p_contractor_id: contractorPayment.contractor_id, p_expected_event_id: expectedEventId,
          p_payment_method: command.optionId, p_payment_method_source: 'customer', p_remove: false,
          p_request_key: `contractor-question:${id}:${expectedEventId}`,
        })
        if (paymentError) throw paymentError
        return NextResponse.json({ ok: true })
      }
      if (contractorW9) {
        const allowed = ['on_file','needed','needs_attention']
        if (!allowed.includes(command.optionId)) throw new Error('That W-9 answer is unavailable.')
        const { error: w9Error } = await supabase.rpc('record_contractor_w9_status', {
          p_contractor_id: contractorW9.contractor_id, p_expected_event_id: expectedEventId,
          p_status: command.optionId, p_evidence_note: '',
          p_request_key: `contractor-w9-question:${id}:${expectedEventId}`,
        })
        if (w9Error) throw w9Error
        return NextResponse.json({ ok: true })
      }
    }
    const { data: deduction } = await supabase.from('current_deduction_attentions').select('*')
      .eq('attention_id', id).maybeSingle()
    if (deduction) {
      if (deduction.id !== expectedEventId) throw new Error('This question changed.')
      const key = `deduction-answer:${id}:${expectedEventId}`
      if (command.action === 'defer') {
        const { error: deferError } = await supabase.rpc('defer_deduction_attention', {
          p_attention_id: id, p_expected_event_id: expectedEventId, p_request_key: key,
        })
        if (deferError) throw deferError
      } else if (command.action === 'deduction_fact') {
        const { error: answerError } = await supabase.rpc('answer_deduction_attention', {
          p_attention_id: id, p_expected_event_id: expectedEventId,
          p_value: command.value, p_request_key: key,
        })
        if (answerError) throw answerError
        const admin = createServerAdminSupabase()
        const next = nextHomeOfficeQuestion(deduction.fact_type, command.value)
        if (next) await admin.rpc('open_deduction_attention', {
          p_business_id: deduction.business_id, p_bookkeeping_record_id: null,
          p_fact_type: next.factType, p_scope_kind: 'business', p_scope_key: 'business',
          p_question_type: next.questionType, p_prompt: next.prompt, p_guidance: next.guidance,
          p_signal_key: `deduction-intelligence:v1:home-office:${next.factType}`,
          p_signal_version: 'deduction-intelligence:v1',
        })
        if (deduction.bookkeeping_record_id) {
          const snapshot = await loadBookkeepingEvaluationSnapshot({ admin,
            businessId: deduction.business_id, recordId: deduction.bookkeeping_record_id })
          await runDeductionIntelligenceForRecord({
            admin,
            snapshot,
            writer: supabase,
            customerAnsweredFact: true,
          })
        }
      } else throw new Error('That answer does not match this deduction question.')
      return NextResponse.json({ ok: true })
    }
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

function nextHomeOfficeQuestion(factType: string, value: string | number | boolean) {
  if (factType === 'home_office_regular_use' && value === true) return {
    factType: 'home_office_exclusive_use', questionType: 'yes_no',
    prompt: 'Is that area used only for your business?',
    guidance: 'Answer based on how the workspace is actually used.',
  }
  if (factType === 'home_office_exclusive_use' && value === true) return {
    factType: 'home_office_square_feet', questionType: 'integer',
    prompt: 'Approximately how many square feet is the workspace?',
    guidance: 'A reasonable whole-number estimate is enough.',
  }
  if (factType === 'home_office_square_feet' && typeof value === 'number') return {
    factType: 'home_total_square_feet', questionType: 'integer',
    prompt: 'Approximately how many square feet is the whole home?',
    guidance: 'A reasonable whole-number estimate is enough.',
  }
  if (factType === 'equipment_business_use_percentage' && typeof value === 'number') return {
    factType: 'equipment_placed_in_service_date', questionType: 'date',
    prompt: 'When did you start using this equipment for your business?',
    guidance: 'Enter the date the equipment first became available for business use.',
  }
  return null
}
