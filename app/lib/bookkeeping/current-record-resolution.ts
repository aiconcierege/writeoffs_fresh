import type { SupabaseClient } from '@supabase/supabase-js'

export type CurrentRecordConvergence = {
  convergenceId: string
  eventId: string
  survivorRecordId: string
  absorbedRecordId: string
  receiptId: string
  financialTransactionId: string
}

export async function loadCurrentRecordConvergences(input: {
  supabase: SupabaseClient
  businessId: string
}) {
  const { data, error } = await input.supabase
    .from('current_bookkeeping_record_convergences')
    .select('convergence_id,convergence_event_id,survivor_record_id,absorbed_record_id,receipt_id,financial_transaction_id')
    .eq('business_id', input.businessId)
  if (error) throw new Error(`Unable to resolve current bookkeeping identity: ${error.message}`)
  const convergences: CurrentRecordConvergence[] = (data ?? []).map((row) => ({
    convergenceId: String(row.convergence_id),
    eventId: String(row.convergence_event_id),
    survivorRecordId: String(row.survivor_record_id),
    absorbedRecordId: String(row.absorbed_record_id),
    receiptId: String(row.receipt_id),
    financialTransactionId: String(row.financial_transaction_id),
  }))
  const absorbedToSurvivor = new Map(convergences.map((item) => [
    item.absorbedRecordId, item.survivorRecordId,
  ]))
  const evidenceRecordIdsBySurvivor = new Map<string, string[]>()
  for (const item of convergences) {
    evidenceRecordIdsBySurvivor.set(item.survivorRecordId, [
      item.survivorRecordId, item.absorbedRecordId,
    ])
  }
  return {
    convergences,
    absorbedToSurvivor,
    evidenceRecordIdsBySurvivor,
    resolve(recordId: string) { return absorbedToSurvivor.get(recordId) ?? recordId },
    isAbsorbed(recordId: string) { return absorbedToSurvivor.has(recordId) },
    evidenceRecordIds(recordId: string) {
      const current = absorbedToSurvivor.get(recordId) ?? recordId
      return evidenceRecordIdsBySurvivor.get(current) ?? [current]
    },
  }
}
