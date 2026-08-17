import type { SupabaseClient } from '@supabase/supabase-js'
import { CanonicalBookkeepingService } from './service'
import { resolveFinancialTransactionRecord } from './financial-transaction-workflow'
import { SupabaseBookkeepingRepository } from './supabase-repository'

export async function attachReceiptToFinancialTransaction(input: {
  supabase: SupabaseClient
  financialTransactionId: string
  receiptId: string
}) {
  const {
    data: { user },
    error,
  } = await input.supabase.auth.getUser()
  if (error || !user) throw new Error('An authenticated user is required.')

  const resolved = await resolveFinancialTransactionRecord({
    supabase: input.supabase,
    financialTransactionId: input.financialTransactionId,
  })
  const service = new CanonicalBookkeepingService(
    new SupabaseBookkeepingRepository(input.supabase)
  )
  const link = await service.linkReceipt({
    actor: {
      businessId: resolved.record.businessId,
      userId: user.id,
      provenance: 'user',
    },
    recordId: resolved.record.id,
    receiptId: input.receiptId,
  })

  return { record: resolved.record, decision: resolved.decision, link }
}
