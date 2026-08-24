import type { SupabaseClient } from '@supabase/supabase-js'

export type CompoundReconciliationScenario =
  | 'processor_settlement'
  | 'loan_payment_split'
  | 'batched_deposit'
  | 'later_bank_match'

export type CompoundRelationshipRole =
  | 'settlement_income'
  | 'settlement_fee'
  | 'loan_principal'
  | 'loan_interest'
  | 'deposit_payment'
  | 'payment_match'

export type CompoundReconciliationComponent = {
  recordId: string
  amountCents: number
  role: CompoundRelationshipRole
}

export async function createCompoundReconciliation(input: {
  supabase: SupabaseClient
  businessId: string
  financialTransactionId: string
  anchorRecordId: string
  scenario: CompoundReconciliationScenario
  basisKind: 'trusted_document' | 'customer_fact' | 'canonical_payment_evidence'
  basisReferenceIds?: string[]
  components: CompoundReconciliationComponent[]
  requestKey: string
}) {
  if (!input.components.length || input.components.some((component) =>
    !Number.isSafeInteger(component.amountCents) || component.amountCents === 0)) {
    throw new Error('Compound reconciliation components require nonzero integer cents.')
  }
  const { data, error } = await input.supabase.rpc('create_bookkeeping_compound_reconciliation', {
    p_business_id: input.businessId,
    p_anchor_financial_transaction_id: input.financialTransactionId,
    p_anchor_bookkeeping_record_id: input.anchorRecordId,
    p_scenario: input.scenario,
    p_basis_kind: input.basisKind,
    p_basis_reference_ids: input.basisReferenceIds ?? [],
    p_components: input.components,
    p_request_key: input.requestKey,
  })
  if (error) throw new Error(error.message)
  return String(data)
}

export async function reverseCompoundReconciliation(input: {
  supabase: SupabaseClient
  reconciliationId: string
  expectedCurrentEventId: string
  requestKey: string
  reason: string
}) {
  const { data, error } = await input.supabase.rpc('reverse_bookkeeping_compound_reconciliation', {
    p_reconciliation_id: input.reconciliationId,
    p_expected_current_event_id: input.expectedCurrentEventId,
    p_request_key: input.requestKey,
    p_reason: input.reason,
  })
  if (error) throw new Error(error.message)
  return String(data)
}
