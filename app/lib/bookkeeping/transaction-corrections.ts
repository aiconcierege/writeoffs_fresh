import type { SupabaseClient } from '@supabase/supabase-js'

export type TransactionUseCorrection =
  | { schemaVersion: 1; use: 'business' | 'personal' }
  | { schemaVersion: 1; use: 'mixed'; personalAmountCents: number }

export function validateTransactionUseCorrection(value: unknown): TransactionUseCorrection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Choose how this purchase was used.')
  }
  const answer = value as Record<string, unknown>
  const keys = Object.keys(answer).sort().join(',')
  if (answer.schemaVersion !== 1) throw new Error('This correction needs to be refreshed.')
  if (answer.use === 'business' || answer.use === 'personal') {
    if (keys !== 'schemaVersion,use') throw new Error('Correction contains unsupported fields.')
    return { schemaVersion: 1, use: answer.use }
  }
  if (answer.use === 'mixed') {
    if (keys !== 'personalAmountCents,schemaVersion,use'
      || !Number.isSafeInteger(answer.personalAmountCents)
      || (answer.personalAmountCents as number) <= 0) {
      throw new Error('Enter the personal amount in whole cents.')
    }
    return { schemaVersion: 1, use: 'mixed',
      personalAmountCents: answer.personalAmountCents as number }
  }
  throw new Error('Choose Business, Personal, or Both.')
}

export async function correctCanonicalTransactionUse(input: {
  supabase: SupabaseClient
  financialTransactionId: string
  expectedCurrentDecisionId: string
  correctionRequestId: string
  answer: unknown
}) {
  const { data: { user }, error: authError } = await input.supabase.auth.getUser()
  if (authError || !user) throw new Error('An authenticated user is required.')
  const answer = validateTransactionUseCorrection(input.answer)
  const { data: component, error: componentError } = await input.supabase
    .from('current_bookkeeping_compound_components')
    .select('bookkeeping_record_id')
    .eq('bookkeeping_record_id', input.financialTransactionId)
    .limit(1)
    .maybeSingle()
  if (componentError) throw new Error('Could not verify the current transaction structure.')
  if (component) {
    const { data, error } = await input.supabase.rpc('correct_compound_bookkeeping_record_use', {
      p_bookkeeping_record_id: input.financialTransactionId,
      p_expected_current_decision_id: input.expectedCurrentDecisionId,
      p_correction_request_id: input.correctionRequestId,
      p_answer: answer,
    })
    if (error) throw new Error(error.message)
    return data
  }
  const { data: compound, error: compoundError } = await input.supabase
    .from('current_bookkeeping_compound_reconciliations')
    .select('reconciliation_id')
    .eq('anchor_financial_transaction_id', input.financialTransactionId)
    .limit(1)
    .maybeSingle()
  if (compoundError) throw new Error('Could not verify the current transaction structure.')
  if (compound) {
    throw new Error('This bank activity contains multiple parts. Correct the individual item instead.')
  }
  const { data, error } = await input.supabase.rpc('correct_bookkeeping_transaction_use', {
    p_financial_transaction_id: input.financialTransactionId,
    p_expected_current_decision_id: input.expectedCurrentDecisionId,
    p_correction_request_id: input.correctionRequestId,
    p_answer: answer,
  })
  if (error) throw new Error(error.message)
  return data
}
