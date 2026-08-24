import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BookkeepingEvaluationSnapshot } from './deterministic-evaluator'

export const DEDUCTION_INTELLIGENCE_VERSION = 'deduction-intelligence:v1'

function normalizedScope(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 200)
}

export function deductionSignal(snapshot: BookkeepingEvaluationSnapshot) {
  const source = `${snapshot.merchantName ?? ''} ${snapshot.description ?? ''}`.toLowerCase()
  const merchantScope = normalizedScope(snapshot.merchantName ?? snapshot.description ?? '')
  if (merchantScope && /\b(?:wireless|mobile|phone|verizon|at&t|t-mobile)\b/.test(source)) {
    const provider = ['verizon','at&t','t-mobile'].find((name) => source.includes(name)) ?? merchantScope
    return { kind: 'phone' as const, factType: 'phone_business_use_percentage', scope: provider }
  }
  if (merchantScope && /\b(?:internet|broadband|fiber|comcast|xfinity|cox)\b/.test(source)) {
    const provider = ['comcast','xfinity','cox'].find((name) => source.includes(name)) ?? merchantScope
    return { kind: 'internet' as const, factType: 'internet_business_use_percentage', scope: provider }
  }
  if (snapshot.amountCents != null && snapshot.amountCents <= -100_000
    && /\b(?:equipment|mower|laptop|camera)\b/.test(source)) {
    return { kind: 'equipment' as const, factType: 'equipment_business_use_percentage', scope: snapshot.recordId }
  }
  return null
}

function questionEligible(date: string | null) {
  if (!date) return false
  const age = Math.floor((Date.now() - Date.parse(`${date}T00:00:00Z`)) / 86_400_000)
  return age >= 0 && age <= 30
}

export async function runDeductionIntelligenceForRecord(input: {
  admin: SupabaseClient
  snapshot: BookkeepingEvaluationSnapshot
  writer?: SupabaseClient
  customerAnsweredFact?: boolean
}) {
  const { admin, snapshot } = input
  await refreshHomeOfficeDiscovery({ admin, businessId: snapshot.businessId })
  const signal = deductionSignal(snapshot)
  if (!signal || snapshot.currentDecision.bookkeepingNature !== 'expense'
    || !['business', 'mixed_use'].includes(snapshot.currentDecision.treatment)) {
    return { outcome: 'not_applicable' as const }
  }

  if (signal.kind === 'equipment') {
    await admin.from('bookkeeping_special_treatment_signals').upsert({
      business_id: snapshot.businessId, bookkeeping_record_id: snapshot.recordId,
      signal_type: 'equipment_review', signal_version: DEDUCTION_INTELLIGENCE_VERSION,
      reason_code: 'POSSIBLE_DURABLE_EQUIPMENT', provenance: 'automation',
    }, { onConflict: 'business_id,bookkeeping_record_id,signal_type,signal_version', ignoreDuplicates: true })
    if (questionEligible(snapshot.occurredOn)) {
      await openAttention(admin, snapshot, signal.factType, 'bookkeeping_record', signal.scope,
        'percentage', 'About how much is this equipment used for your business?',
        'Enter an approximate percentage. WriteOffs will keep special tax treatment unresolved until the needed facts and rules are available.')
    }
    return { outcome: 'special_treatment' as const }
  }

  const { data: fact, error: factError } = await admin.from('current_deduction_business_facts')
    .select('*').eq('business_id', snapshot.businessId).eq('fact_type', signal.factType)
    .eq('scope_kind', 'merchant').eq('scope_key', signal.scope).maybeSingle()
  if (factError) throw new Error('DEDUCTION_FACT_LOAD_FAILED')
  if (!fact) {
    if (questionEligible(snapshot.occurredOn)) {
      await openAttention(admin, snapshot, signal.factType, 'merchant', signal.scope, 'percentage',
        `About how much do you use this ${signal.kind} service for your business?`,
        'Enter an approximate percentage. WriteOffs will remember it for this recurring service.')
    }
    return { outcome: 'missing_fact' as const }
  }
  const percentage = Number(fact.fact_value)
  if (!Number.isInteger(percentage) || percentage < 1 || percentage > 100 || snapshot.amountCents == null) {
    return { outcome: 'invalid_fact' as const }
  }
  const { data: existingDependencies, error: dependencyLoadError } = await admin
    .from('bookkeeping_decision_deduction_fact_dependencies')
    .select('id,fact_event_id').eq('bookkeeping_decision_id', snapshot.currentDecision.id)
  if (dependencyLoadError) throw new Error('DEDUCTION_FACT_DEPENDENCY_LOAD_FAILED')
  if (existingDependencies?.some((dependency) => dependency.fact_event_id === fact.id)) {
    return { outcome: 'already_applied' as const }
  }
  const factDerivedCustomerDecision = snapshot.currentDecision.provenance === 'user'
    && Boolean(existingDependencies?.length)
  if (snapshot.currentDecision.provenance === 'user'
    && !input.customerAnsweredFact && !factDerivedCustomerDecision) {
    return { outcome: 'customer_decision_preserved' as const }
  }
  const currentBusinessAllocation = snapshot.currentDecision.allocations.find((allocation) => allocation.kind === 'business')
  const businessCents = -Math.round(Math.abs(snapshot.amountCents) * percentage / 100)
  const personalCents = snapshot.amountCents - businessCents
  const provenance = input.customerAnsweredFact ? 'user' : 'system'
  const writer = input.customerAnsweredFact ? input.writer : admin
  if (!writer) throw new Error('DEDUCTION_CUSTOMER_WRITER_REQUIRED')
  const { data: decisionId, error: decisionError } = await writer.rpc('append_bookkeeping_decision', {
    p_business_id: snapshot.businessId, p_bookkeeping_record_id: snapshot.recordId,
    p_expected_current_decision_id: snapshot.currentDecision.id, p_bookkeeping_nature: 'expense',
    p_treatment: percentage === 100 ? 'business' : 'mixed_use', p_review_status: 'resolved',
    p_provenance: provenance, p_confidence: null,
    p_reason: `Applied the customer-provided ${signal.kind} business-use percentage.`,
    p_business_purpose: snapshot.currentDecision.businessPurpose,
    p_allocations: percentage === 100
      ? [{ kind: 'business', amount_cents: snapshot.amountCents,
        tax_category_key: currentBusinessAllocation?.taxCategoryKey ?? null }]
      : [{ kind: 'business', amount_cents: businessCents,
        tax_category_key: currentBusinessAllocation?.taxCategoryKey ?? null },
      { kind: 'personal', amount_cents: personalCents }],
  })
  if (decisionError) throw new Error('DEDUCTION_ALLOCATION_WRITE_FAILED')
  const { error: dependencyError } = await admin.from('bookkeeping_decision_deduction_fact_dependencies').insert({
    business_id: snapshot.businessId, bookkeeping_record_id: snapshot.recordId,
    bookkeeping_decision_id: decisionId, fact_event_id: fact.id, fact_type: fact.fact_type,
    scope_kind: fact.scope_kind, scope_key: fact.scope_key,
  })
  if (dependencyError) throw new Error('DEDUCTION_FACT_DEPENDENCY_WRITE_FAILED')
  return { outcome: 'applied' as const, decisionId: String(decisionId) }
}

async function openAttention(admin: SupabaseClient, snapshot: BookkeepingEvaluationSnapshot,
  factType: string, scopeKind: string, scopeKey: string, questionType: string,
  prompt: string, guidance: string) {
  const { error } = await admin.rpc('open_deduction_attention', {
    p_business_id: snapshot.businessId, p_bookkeeping_record_id: snapshot.recordId,
    p_fact_type: factType, p_scope_kind: scopeKind, p_scope_key: scopeKey,
    p_question_type: questionType, p_prompt: prompt, p_guidance: guidance,
    p_signal_key: `${DEDUCTION_INTELLIGENCE_VERSION}:${factType}:${scopeKind}:${scopeKey}`,
    p_signal_version: DEDUCTION_INTELLIGENCE_VERSION,
  })
  if (error) throw new Error('DEDUCTION_ATTENTION_OPEN_FAILED')
}

export async function refreshHomeOfficeDiscovery(input: { admin: SupabaseClient; businessId: string }) {
  const { data: business } = await input.admin.from('businesses').select('business_description')
    .eq('id', input.businessId).maybeSingle()
  if (!/\b(?:home[- ]based|work(?:ing)? from home|home office)\b/i.test(business?.business_description ?? '')) return false
  const { error } = await input.admin.rpc('open_deduction_attention', {
    p_business_id: input.businessId, p_bookkeeping_record_id: null,
    p_fact_type: 'home_office_regular_use', p_scope_kind: 'business', p_scope_key: 'business',
    p_question_type: 'yes_no', p_prompt: 'Do you regularly work from an area of your home for this business?',
    p_guidance: 'WriteOffs will ask only for factual details needed to check this safely.',
    p_signal_key: `${DEDUCTION_INTELLIGENCE_VERSION}:home-office:regular-use`,
    p_signal_version: DEDUCTION_INTELLIGENCE_VERSION,
  })
  if (error) throw new Error('HOME_OFFICE_DISCOVERY_FAILED')
  return true
}
