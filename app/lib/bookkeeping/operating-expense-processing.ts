import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BookkeepingEvaluationSnapshot } from './deterministic-evaluator'
import { classifyOperatingExpense } from './operating-expense-classification'
import { evaluateAndAppendProductionTaxTreatment } from './tax-treatment-service'
import { SupabaseBookkeepingRepository } from './supabase-repository'

export function operatingExpenseFingerprint(value: unknown): string {
  const stable = (item: unknown): unknown => Array.isArray(item) ? item.map(stable)
    : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, stable(nested)])) : item
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
}

export async function processOperatingExpenseTreatment(input: {
  admin: SupabaseClient
  snapshot: BookkeepingEvaluationSnapshot
}) {
  const { admin, snapshot } = input
  if ((snapshot.amountCents ?? 0) >= 0 || ['personal', 'excluded'].includes(snapshot.currentDecision.treatment)) {
    return { outcome: 'not_applicable' as const }
  }
  const classification = classifyOperatingExpense(snapshot)
  let mealFactId: string | null = null
  if (classification.categoryKey === 'meals') {
    const { data: mealFact, error: mealError } = await admin.from('current_bookkeeping_meal_substantiation_facts')
      .select('id').eq('business_id', snapshot.businessId).eq('bookkeeping_record_id', snapshot.recordId).maybeSingle()
    if (mealError) throw new Error('MEAL_FACT_LOAD_FAILED')
    mealFactId = mealFact?.id ?? null
    // Recognizing a meal never establishes its missing contemporaneous facts.
    classification.taxFacts.mealBusinessContext = Boolean(mealFactId && snapshot.currentDecision.businessPurpose)
  }
  const evidenceFingerprint = operatingExpenseFingerprint({ version: classification.version,
    decisionId: snapshot.currentDecision.id, recordId: snapshot.recordId,
    categoryKey: classification.categoryKey, reasonCode: classification.reasonCode,
    taxFacts: classification.taxFacts, evidence: classification.evidence, mealFactId })
  const { data: currentAssessment, error: assessmentLoadError } = await admin
    .from('current_schedule_c_expense_assessments').select('id,evidence_fingerprint')
    .eq('business_id', snapshot.businessId).eq('bookkeeping_record_id', snapshot.recordId).maybeSingle()
  if (assessmentLoadError && assessmentLoadError.code !== '42P01') throw new Error('SCHEDULE_C_ASSESSMENT_LOAD_FAILED')
  if (currentAssessment?.evidence_fingerprint !== evidenceFingerprint) {
    const { error } = await admin.from('schedule_c_expense_assessments').insert({
      business_id: snapshot.businessId, bookkeeping_record_id: snapshot.recordId,
      bookkeeping_decision_id: snapshot.currentDecision.id,
      supersedes_assessment_id: currentAssessment?.id ?? null,
      assessment_version: classification.version,
      category_state: !classification.categoryKey ? 'unresolved' : snapshot.currentDecision.allocations.some(a =>
        a.kind === 'business' && a.taxCategoryKey === classification.categoryKey) ? 'established' : 'candidate',
      assessment_status: classification.status,
      schedule_c_category_key: classification.categoryKey,
      special_treatment_reason: ['special_treatment', 'unsupported'].includes(classification.status)
        ? classification.reasonCode : null,
      confidence: classification.confidence,
      evidence_fingerprint: evidenceFingerprint,
      evidence_references: classification.evidence,
      factual_basis: classification.taxFacts,
      provenance: 'automation',
    })
    if (error && error.code !== '42P01') throw new Error('SCHEDULE_C_ASSESSMENT_WRITE_FAILED')
  }
  // The append-only assessment is a candidate until a business allocation exists.
  if (snapshot.currentDecision.bookkeepingNature !== 'expense'
    || !['business', 'mixed_use'].includes(snapshot.currentDecision.treatment))
    return { outcome: 'candidate' as const, classification }
  if ((classification.status === 'needs_facts'
    || (classification.categoryKey === 'travel' && !snapshot.currentDecision.businessPurpose))
) {
    const factType = classification.categoryKey === 'travel' ? 'business_travel_details'
      : classification.reasonCode === 'CONFLICTING_CATEGORY_EVIDENCE' ? 'category_conflict'
        : 'ordinary_expense_purpose'
    // A classifier failing to understand a saved answer is not a new missing
    // customer fact. Keep the assessment unresolved; never manufacture certainty.
    if (factType === 'ordinary_expense_purpose') {
      const { data: supplied, error } = await admin.rpc('bookkeeping_has_current_expense_purpose_answer', {
        p_business_id: snapshot.businessId, p_record_id: snapshot.recordId,
      })
      if (error) throw new Error('EXPENSE_PURPOSE_ANSWER_LOAD_FAILED')
      if (supplied) return { outcome: 'needs_facts' as const, classification }
    }
    await new SupabaseBookkeepingRepository(admin).openReviewIssue({
      businessId: snapshot.businessId, recordId: snapshot.recordId,
      decisionId: snapshot.currentDecision.id, reason: 'BUSINESS_PURPOSE_NEEDED',
      issueKey: `schedule-c-category:${snapshot.recordId}:${snapshot.currentDecision.id}`,
      contextFingerprint: `${evidenceFingerprint}:expense-purpose`,
      questionContext: { schemaVersion: 1, routingVersion: classification.version,
        reason: 'BUSINESS_PURPOSE_NEEDED', factType,
        establishedFacts: ['purchase', 'businessContext'] },
    })
  }
  if (classification.status !== 'ordinary' || !classification.categoryKey) {
    return { outcome: classification.status as 'needs_facts' | 'special_treatment' | 'unsupported', classification }
  }
  const { data: allocationRows, error: allocationError } = await admin.from('bookkeeping_allocations')
    .select('id,allocation_kind,tax_category_key').eq('business_id', snapshot.businessId)
    .eq('bookkeeping_decision_id', snapshot.currentDecision.id)
  if (allocationError) throw new Error('SCHEDULE_C_ALLOCATION_LOAD_FAILED')
  const matching = (allocationRows ?? []).filter(allocation =>
    allocation.allocation_kind === 'business' && allocation.tax_category_key === classification.categoryKey)
  if (!matching.length) return { outcome: 'category_not_current' as const, classification }
  const results = []
  for (const allocation of matching) {
    const { data: history, error } = await admin.from('bookkeeping_tax_treatments')
      .select('id,supersedes_tax_treatment_id').eq('business_id', snapshot.businessId)
      .eq('bookkeeping_allocation_id', allocation.id)
    if (error) throw new Error('SCHEDULE_C_TREATMENT_LOAD_FAILED')
    const superseded = new Set((history ?? []).map(row => row.supersedes_tax_treatment_id).filter(Boolean))
    const leaves = (history ?? []).filter(row => !superseded.has(row.id))
    if (leaves.length > 1) throw new Error('SCHEDULE_C_TREATMENT_HISTORY_INVALID')
    results.push(await evaluateAndAppendProductionTaxTreatment({
      supabase: admin, businessId: snapshot.businessId, allocationId: allocation.id,
      expectedCurrentTaxTreatmentId: leaves[0]?.id ?? null,
      facts: classification.taxFacts,
      evaluationRequestId: evidenceFingerprint.slice(0, 32),
    }))
  }
  return { outcome: results.every(result => result.status === 'resolved') ? 'resolved' as const : 'unresolved' as const,
    classification, results }
}
