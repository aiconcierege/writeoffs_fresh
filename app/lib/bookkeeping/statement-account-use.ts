import type { SupabaseClient } from '@supabase/supabase-js'
import type { StatementUseAccount } from '../../components/StatementAccountUse'

/** Authenticated RLS reads only. Never infer use from the account name. */
export async function loadStatementAccountUse(supabase: SupabaseClient, unknownOnly = false): Promise<StatementUseAccount[]> {
  const [accounts, uses] = await Promise.all([
    supabase.from('financial_accounts').select('id,display_name,mask_last_four')
      .eq('provider', 'statement').is('archived_at', null),
    supabase.from('current_financial_account_use').select('financial_account_id,designation'),
  ])
  if (accounts.error || uses.error) throw new Error('Statement account choices could not be loaded.')
  const byAccount = new Map((uses.data ?? []).map(row => [row.financial_account_id, row.designation]))
  return (accounts.data ?? []).map(row => ({ id: row.id, displayName: row.display_name,
    mask: row.mask_last_four, designation: byAccount.get(row.id) ?? null }))
    .filter(row => !unknownOnly || !row.designation)
}
