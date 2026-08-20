import type { SupabaseClient } from '@supabase/supabase-js'

type Version = {
  id: string
  plaid_transaction_id: string
  supersedes_version_id: string | null
  canonical_financial_transaction_id: string | null
  event_type: string
}

export async function currentPlaidFinancialState(input: {
  supabase: SupabaseClient
  businessId: string
  candidateFinancialTransactionIds: string[]
}) {
  const mapped: Version[] = []
  for (let index = 0; index < input.candidateFinancialTransactionIds.length; index += 200) {
    const { data, error } = await input.supabase.from('plaid_transaction_versions')
      .select('id,plaid_transaction_id,supersedes_version_id,canonical_financial_transaction_id,event_type')
      .eq('business_id', input.businessId)
      .in('canonical_financial_transaction_id', input.candidateFinancialTransactionIds.slice(index, index + 200))
    if (error) throw new Error(`Unable to load connected transaction state: ${error.message}`)
    mapped.push(...(data ?? []) as Version[])
  }
  const transactionIds = [...new Set(mapped.map((version) => version.plaid_transaction_id))]
  const versions: Version[] = []
  for (let index = 0; index < transactionIds.length; index += 200) {
    const { data, error } = await input.supabase.from('plaid_transaction_versions')
      .select('id,plaid_transaction_id,supersedes_version_id,canonical_financial_transaction_id,event_type')
      .eq('business_id', input.businessId).in('plaid_transaction_id', transactionIds.slice(index, index + 200))
    if (error) throw new Error(`Unable to load connected transaction state: ${error.message}`)
    versions.push(...(data ?? []) as Version[])
  }
  const superseded = new Set(versions.map((version) => version.supersedes_version_id).filter(Boolean))
  return {
    allCanonicalIds: new Set(mapped.map((version) => version.canonical_financial_transaction_id)
      .filter(Boolean) as string[]),
    currentCanonicalIds: new Set(versions.filter((version) => !superseded.has(version.id)
      && version.event_type !== 'removed' && version.canonical_financial_transaction_id)
      .map((version) => version.canonical_financial_transaction_id as string)),
  }
}

export function plaidFinancialTransactionIsCurrent(input: {
  id: string
  state: Awaited<ReturnType<typeof currentPlaidFinancialState>>
}) {
  return !input.state.allCanonicalIds.has(input.id) || input.state.currentCanonicalIds.has(input.id)
}
