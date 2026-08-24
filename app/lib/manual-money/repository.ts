import type { SupabaseClient } from '@supabase/supabase-js'

export async function requireManualMoneyBusiness(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('AUTH_REQUIRED')
  const { data, error } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  if (error || !data) throw new Error('BUSINESS_UNAVAILABLE')
  return { user, businessId: String(data.id) }
}

export async function listManualMoney(supabase: SupabaseClient) {
  const { businessId } = await requireManualMoneyBusiness(supabase)
  const { data, error } = await supabase.from('current_manual_financial_activity')
    .select('manual_financial_source_id,id,bookkeeping_record_id,direction,amount_cents,currency,occurred_on,payment_method,counterparty_name,description,job_label,location,note,created_at')
    .eq('business_id', businessId).order('occurred_on', { ascending: false })
  if (error) throw new Error('MANUAL_MONEY_UNAVAILABLE')
  const activities = data ?? []
  const { data: transactions, error: transactionError } = await supabase.from('financial_transactions')
    .select('id,amount_cents,currency,transaction_date,merchant_name,original_description,pending')
    .eq('business_id', businessId).eq('pending', false)
  if (transactionError) throw new Error('MANUAL_MONEY_UNAVAILABLE')
  const transactionIds = (transactions ?? []).map((row) => row.id)
  const [{ data: sourceRows }, { data: activeCompounds }] = await Promise.all([
    transactionIds.length ? supabase.from('bookkeeping_financial_sources')
      .select('financial_transaction_id,bookkeeping_record_id').eq('business_id', businessId)
      .in('financial_transaction_id', transactionIds).is('revoked_at', null) : Promise.resolve({ data: [] }),
    supabase.from('current_bookkeeping_compound_reconciliations')
      .select('anchor_financial_transaction_id').eq('business_id', businessId),
  ])
  const activeFinancialIds = new Set((activeCompounds ?? []).map((row) => String(row.anchor_financial_transaction_id)))
  const recordByFinancial = new Map((sourceRows ?? []).map((row) => [String(row.financial_transaction_id), String(row.bookkeeping_record_id)]))
  const eligibleTransactions = (transactions ?? []).filter((row) => recordByFinancial.has(String(row.id)) && !activeFinancialIds.has(String(row.id)))
  const withMatches = activities.map((activity) => {
    const key = `${activity.amount_cents}:${activity.currency}:${activity.occurred_on}`
    const sameManualCount = activities.filter((candidate) => `${candidate.amount_cents}:${candidate.currency}:${candidate.occurred_on}` === key).length
    const matches = eligibleTransactions.filter((candidate) => `${candidate.amount_cents}:${candidate.currency}:${candidate.transaction_date}` === key)
    return { ...activity, bank_match: sameManualCount === 1 && matches.length === 1 ? {
      financialTransactionId: matches[0].id,
      label: matches[0].merchant_name ?? matches[0].original_description ?? 'Bank activity',
    } : null }
  })
  return { businessId, activities: withMatches }
}
