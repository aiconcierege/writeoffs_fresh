import type { SupabaseClient } from '@supabase/supabase-js'

export type CurrentRecordConvergence = {
  convergenceId: string
  eventId: string
  survivorRecordId: string
  absorbedRecordId: string
  receiptId: string
  financialTransactionId: string
}

export type CurrentCompoundComponent = {
  reconciliationId: string
  eventId: string
  anchorRecordId: string
  financialTransactionId: string
  recordId: string
  linkId: string
  linkedAmountCents: number
  relationshipRole: string
}

export async function loadCurrentRecordConvergences(input: {
  supabase: SupabaseClient
  businessId: string
}) {
  const [convergenceResult, receiptResult, compoundResult] = await Promise.all([
    input.supabase.from('current_bookkeeping_record_convergences')
      .select('convergence_id,convergence_event_id,survivor_record_id,absorbed_record_id,receipt_id,financial_transaction_id')
      .eq('business_id', input.businessId),
    input.supabase.from('bookkeeping_receipt_events')
      .select('id,supersedes_event_id,event_type,bookkeeping_record_id,context').eq('business_id', input.businessId),
    input.supabase.from('current_bookkeeping_compound_components')
      .select('reconciliation_id,reconciliation_event_id,anchor_bookkeeping_record_id,anchor_financial_transaction_id,bookkeeping_record_id,link_id,linked_amount_cents,relationship_role')
      .eq('business_id', input.businessId),
  ])
  if (convergenceResult.error || receiptResult.error || compoundResult.error) throw new Error(`Unable to resolve current bookkeeping identity: ${convergenceResult.error?.message ?? receiptResult.error?.message ?? compoundResult.error?.message}`)
  const convergences: CurrentRecordConvergence[] = (convergenceResult.data ?? []).map((row) => ({
    convergenceId: String(row.convergence_id),
    eventId: String(row.convergence_event_id),
    survivorRecordId: String(row.survivor_record_id),
    absorbedRecordId: String(row.absorbed_record_id),
    receiptId: String(row.receipt_id),
    financialTransactionId: String(row.financial_transaction_id),
  }))
  const receiptEvents = receiptResult.data ?? []
  const compoundComponents: CurrentCompoundComponent[] = (compoundResult.data ?? []).map((row) => ({
    reconciliationId: String(row.reconciliation_id),
    eventId: String(row.reconciliation_event_id),
    anchorRecordId: String(row.anchor_bookkeeping_record_id),
    financialTransactionId: String(row.anchor_financial_transaction_id),
    recordId: String(row.bookkeeping_record_id),
    linkId: String(row.link_id),
    linkedAmountCents: Number(row.linked_amount_cents),
    relationshipRole: String(row.relationship_role),
  }))
  const supersededReceiptEvents = new Set(receiptEvents.map((event) => event.supersedes_event_id).filter(Boolean))
  const inactiveReceiptRecordIds = new Set(receiptEvents.filter((event) =>
    !supersededReceiptEvents.has(event.id) && event.event_type === 'discarded' && event.bookkeeping_record_id
      && (event.context as Record<string, unknown> | null)?.deactivateReceiptOnly === true)
    .map((event) => String(event.bookkeeping_record_id)))
  const absorbedToSurvivor = new Map(convergences.map((item) => [
    item.absorbedRecordId, item.survivorRecordId,
  ]))
  const suppressedCompoundAnchorIds = new Set(compoundComponents.map((item) => item.anchorRecordId))
  const compoundByRecord = new Map(compoundComponents.map((item) => [item.recordId, item]))
  const evidenceRecordIdsBySurvivor = new Map<string, string[]>()
  for (const item of convergences) {
    evidenceRecordIdsBySurvivor.set(item.survivorRecordId, [
      item.survivorRecordId, item.absorbedRecordId,
    ])
  }
  const compoundEvidenceIds = new Map<string, string[]>()
  for (const item of compoundComponents) {
    const groupIds = compoundEvidenceIds.get(item.reconciliationId)
      ?? [...(evidenceRecordIdsBySurvivor.get(item.anchorRecordId) ?? [item.anchorRecordId])]
    if (!groupIds.includes(item.recordId)) groupIds.push(item.recordId)
    compoundEvidenceIds.set(item.reconciliationId, groupIds)
  }
  for (const item of compoundComponents) {
    evidenceRecordIdsBySurvivor.set(
      item.recordId,
      compoundEvidenceIds.get(item.reconciliationId) ?? [item.recordId],
    )
  }
  return {
    convergences,
    compoundComponents,
    absorbedToSurvivor,
    evidenceRecordIdsBySurvivor,
    resolve(recordId: string) { return absorbedToSurvivor.get(recordId) ?? recordId },
    isAbsorbed(recordId: string) { return absorbedToSurvivor.has(recordId) },
    isInactive(recordId: string) {
      return inactiveReceiptRecordIds.has(recordId) || suppressedCompoundAnchorIds.has(recordId)
    },
    compoundComponent(recordId: string) { return compoundByRecord.get(recordId) ?? null },
    financialTransactionId(recordId: string) {
      return compoundByRecord.get(recordId)?.financialTransactionId ?? null
    },
    evidenceRecordIds(recordId: string) {
      const current = absorbedToSurvivor.get(recordId) ?? recordId
      return evidenceRecordIdsBySurvivor.get(current) ?? [current]
    },
  }
}
