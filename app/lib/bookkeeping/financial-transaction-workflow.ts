import type { SupabaseClient } from '@supabase/supabase-js'
import { CanonicalBookkeepingService } from './service'
import { SupabaseBookkeepingRepository } from './supabase-repository'

export async function resolveFinancialTransactionRecord(input: {
  supabase: SupabaseClient
  financialTransactionId: string
}) {
  const {
    data: { user },
    error,
  } = await input.supabase.auth.getUser()
  if (error || !user) {
    throw new Error('An authenticated user is required.')
  }
  const repository = new SupabaseBookkeepingRepository(input.supabase)
  const service = new CanonicalBookkeepingService(repository)
  return service.resolveFinancialTransactionRecord({
    userId: user.id,
    financialTransactionId: input.financialTransactionId,
  })
}
