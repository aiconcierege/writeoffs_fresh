import type { SupabaseClient } from '@supabase/supabase-js'
import { validateTrustedTaxTreatment, type TaxTreatmentStatus } from './tax-treatment-model'

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
  if (input.status !== 'unresolved' && allocation.tax_category_key !== input.taxCategoryKey) {
    throw new Error('Tax treatment category must match the canonical allocation.')
  }
  const findExisting = async () => {
    const { data } = await input.supabase.from('bookkeeping_tax_treatments')
      .select('id,supersedes_tax_treatment_id,treatment_status,deductible_amount_cents,tax_category_key,rule_key,rule_version,reason,provenance,confidence')
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
  }).select('id').single()
  if (error) {
    const converged = await findExisting()
    if (converged) return converge(converged)!
    throw new Error(`Unable to append trusted tax treatment: ${error.message}`)
  }
  return { ...data, idempotent: false }
}
