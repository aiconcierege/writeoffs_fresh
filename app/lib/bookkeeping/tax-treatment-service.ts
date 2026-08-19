import type { SupabaseClient } from '@supabase/supabase-js'
import { validateTaxRuleAudit, validateTrustedTaxTreatment, type TaxTreatmentStatus } from './tax-treatment-model'
import { evaluateProductionTaxRules } from './tax-rule-engine'
import type { TaxRuleFacts } from './tax-rule-catalog'

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  return JSON.stringify(value)
}

/**
 * Trusted background entry point for the fixed production catalog. The caller can
 * supply factual evidence, but cannot select a rule or replace the catalog.
 */
export async function evaluateAndAppendProductionTaxTreatment(input: {
  supabase: SupabaseClient
  businessId: string
  allocationId: string
  expectedCurrentTaxTreatmentId: string | null
  facts: TaxRuleFacts
  evaluationRequestId: string
}) {
  if (!input.evaluationRequestId.trim() || input.evaluationRequestId.length > 100) {
    throw new Error('A stable tax evaluation request identity is required.')
  }
  const { data: allocation, error } = await input.supabase.from('bookkeeping_allocations')
    .select('amount_cents,tax_category_key,allocation_kind,bookkeeping_record_id')
    .eq('id', input.allocationId).eq('business_id', input.businessId).maybeSingle()
  if (error || !allocation || allocation.allocation_kind !== 'business') {
    throw new Error('The canonical business allocation was not found.')
  }
  if (!allocation.tax_category_key) {
    return { status: 'unresolved' as const, reason: 'no_active_rule' as const,
      missingFacts: [], ruleIdentities: [] }
  }
  const { data: record, error: recordError } = await input.supabase.from('bookkeeping_records')
    .select('occurred_on').eq('id', allocation.bookkeeping_record_id)
    .eq('business_id', input.businessId).maybeSingle()
  if (recordError || !record?.occurred_on || !/^\d{4}-\d{2}-\d{2}$/.test(record.occurred_on)) {
    throw new Error('The canonical economic date was not found.')
  }
  const taxYear = Number(record.occurred_on.slice(0, 4))
  const evaluation = evaluateProductionTaxRules({ taxYear,
    taxCategoryKey: allocation.tax_category_key,
    businessAllocationAmountCents: Number(allocation.amount_cents), facts: input.facts })
  if (evaluation.status !== 'resolved') return evaluation
  const persisted = await appendTrustedTaxTreatment({ supabase: input.supabase,
    businessId: input.businessId, allocationId: input.allocationId,
    expectedCurrentTaxTreatmentId: input.expectedCurrentTaxTreatmentId,
    conclusionKey: `${evaluation.ruleKey}@${evaluation.ruleVersion}:${taxYear}:${input.evaluationRequestId}`,
    status: evaluation.treatmentStatus, deductibleAmountCents: evaluation.deductibleAmountCents,
    taxCategoryKey: evaluation.taxCategoryKey, ruleKey: evaluation.ruleKey,
    ruleVersion: evaluation.ruleVersion, reason: evaluation.reason, provenance: 'automation',
    taxYear: evaluation.taxYear, outcomeType: evaluation.outcomeType,
    adjustmentMethod: evaluation.adjustmentMethod, factualBasis: evaluation.factualBasis,
    authorityReferences: evaluation.authorityReferences as unknown as Array<Record<string, string | null>> })
  return { ...evaluation, treatmentId: persisted.id, idempotent: persisted.idempotent }
}

/** Background-only writer. The table grants customers SELECT but no INSERT. */
export async function appendTrustedTaxTreatment(input: {
  supabase: SupabaseClient
  businessId: string
  allocationId: string
  expectedCurrentTaxTreatmentId: string | null
  conclusionKey: string
  status: TaxTreatmentStatus
  deductibleAmountCents: number | null
  taxCategoryKey: string | null
  ruleKey: string | null
  ruleVersion: number | null
  reason: string
  provenance: 'automation' | 'system'
  confidence?: number | null
  taxYear?: number | null
  outcomeType?: 'full_deduction' | 'fixed_fraction' | 'nondeductible' | 'special_treatment' | null
  adjustmentMethod?: 'none' | 'fixed_fraction' | 'special_calculation' | null
  factualBasis?: Record<string, string | number | boolean | null>
  authorityReferences?: Array<Record<string, string | null>>
}) {
  if (!input.conclusionKey.trim() || input.conclusionKey.trim().length > 200) {
    throw new Error('A stable trusted conclusion key is required.')
  }
  const { data: allocation, error: allocationError } = await input.supabase
    .from('bookkeeping_allocations')
    .select('id,business_id,bookkeeping_record_id,bookkeeping_decision_id,allocation_kind,amount_cents,tax_category_key')
    .eq('id', input.allocationId).eq('business_id', input.businessId).maybeSingle()
  if (allocationError || !allocation || allocation.allocation_kind !== 'business') {
    throw new Error('The canonical business allocation was not found.')
  }
  validateTrustedTaxTreatment({ allocationAmountCents: Number(allocation.amount_cents),
    status: input.status, deductibleAmountCents: input.deductibleAmountCents,
    taxCategoryKey: input.taxCategoryKey, ruleKey: input.ruleKey,
    ruleVersion: input.ruleVersion, reason: input.reason })
  validateTaxRuleAudit({ status: input.status, taxYear: input.taxYear ?? null,
    outcomeType: input.outcomeType ?? null, adjustmentMethod: input.adjustmentMethod ?? null,
    authorityReferences: input.authorityReferences ?? [] })
  if (input.status !== 'unresolved' && allocation.tax_category_key !== input.taxCategoryKey) {
    throw new Error('Tax treatment category must match the canonical allocation.')
  }
  const findExisting = async () => {
    const { data } = await input.supabase.from('bookkeeping_tax_treatments')
      .select('id,supersedes_tax_treatment_id,treatment_status,deductible_amount_cents,tax_category_key,rule_key,rule_version,reason,provenance,confidence,tax_year,outcome_type,adjustment_method,factual_basis,authority_references')
      .eq('business_id', input.businessId).eq('bookkeeping_allocation_id', input.allocationId)
      .eq('conclusion_key', input.conclusionKey.trim()).maybeSingle()
    return data
  }
  const converge = (existing: Awaited<ReturnType<typeof findExisting>>) => {
    if (!existing) return null
    const matches = existing.supersedes_tax_treatment_id === input.expectedCurrentTaxTreatmentId
      && existing.treatment_status === input.status
      && (existing.deductible_amount_cents == null ? null : Number(existing.deductible_amount_cents)) === input.deductibleAmountCents
      && existing.tax_category_key === input.taxCategoryKey && existing.rule_key === input.ruleKey
      && (existing.rule_version == null ? null : Number(existing.rule_version)) === input.ruleVersion
      && existing.reason === input.reason.trim() && existing.provenance === input.provenance
      && (existing.confidence == null ? null : Number(existing.confidence)) === (input.confidence ?? null)
      && (existing.tax_year == null ? null : Number(existing.tax_year)) === (input.taxYear ?? null)
      && existing.outcome_type === (input.outcomeType ?? null)
      && existing.adjustment_method === (input.adjustmentMethod ?? null)
      && stableJson(existing.factual_basis ?? {}) === stableJson(input.factualBasis ?? {})
      && stableJson(existing.authority_references ?? []) === stableJson(input.authorityReferences ?? [])
    if (!matches) throw new Error('Tax-treatment conclusion key was reused with different content.')
    return { id: existing.id, idempotent: true }
  }
  const existing = await findExisting()
  if (existing) return converge(existing)!
  const { data: history, error: historyError } = await input.supabase
    .from('bookkeeping_tax_treatments').select('id,supersedes_tax_treatment_id')
    .eq('business_id', input.businessId).eq('bookkeeping_allocation_id', input.allocationId)
  if (historyError) throw new Error('Unable to verify current tax treatment.')
  const superseded = new Set((history ?? []).map((item) => item.supersedes_tax_treatment_id).filter(Boolean))
  const leaves = (history ?? []).filter((item) => !superseded.has(item.id))
  if (leaves.length > 1 || (leaves[0]?.id ?? null) !== input.expectedCurrentTaxTreatmentId) {
    const converged = await findExisting()
    if (converged) return converge(converged)!
    throw new Error('Tax treatment changed before this conclusion was applied.')
  }
  const { data, error } = await input.supabase.from('bookkeeping_tax_treatments').insert({
    business_id: input.businessId, bookkeeping_record_id: allocation.bookkeeping_record_id,
    bookkeeping_decision_id: allocation.bookkeeping_decision_id,
    bookkeeping_allocation_id: allocation.id,
    conclusion_key: input.conclusionKey.trim(),
    supersedes_tax_treatment_id: input.expectedCurrentTaxTreatmentId,
    treatment_status: input.status, deductible_amount_cents: input.deductibleAmountCents,
    tax_category_key: input.taxCategoryKey, rule_key: input.ruleKey,
    rule_version: input.ruleVersion, reason: input.reason.trim(), provenance: input.provenance,
    confidence: input.confidence ?? null,
    tax_year: input.taxYear ?? null, outcome_type: input.outcomeType ?? null,
    adjustment_method: input.adjustmentMethod ?? null, factual_basis: input.factualBasis ?? {},
    authority_references: input.authorityReferences ?? [],
  }).select('id').single()
  if (error) {
    const converged = await findExisting()
    if (converged) return converge(converged)!
    throw new Error(`Unable to append trusted tax treatment: ${error.message}`)
  }
  return { ...data, idempotent: false }
}
