import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// Page navigation is not an API security boundary. All customer-side Plaid
// mutations require the same verified second factor as bookkeeping commands.
// Call only after getAuthenticatedContext has verified the user server-side.
export async function hasPlaidMfa(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    return !error && data?.currentLevel === 'aal2'
  } catch { return false }
}
