import type { SupabaseClient } from '@supabase/supabase-js'
import { listCustomerQuestions } from './customer-questions'
import {
  aggregateCanonicalFinancialSummary,
  type CanonicalFinancialSummary,
} from './financial-summary'
import {
  SupabaseCanonicalFinancialSummaryRepository,
  type CanonicalFinancialSummaryRepository,
} from './financial-summary-repository'

export class CanonicalFinancialSummaryService {
  constructor(private readonly repository: CanonicalFinancialSummaryRepository) {}

  async summarize(input: {
    userId: string
    periodStart: string
    periodEnd: string
    currency: string
    unresolvedCustomerQuestionCount: number
  }): Promise<CanonicalFinancialSummary> {
    if (!input.userId.trim()) throw new Error('An authenticated user is required.')
    const businessId = await this.repository.findBusinessIdForUser(input.userId)
    if (!businessId) throw new Error('Business was not found for the authenticated user.')
    const state = await this.repository.loadRecords({
      businessId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    })
    return aggregateCanonicalFinancialSummary({
      ...state,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      currency: input.currency,
      unresolvedCustomerQuestionCount: input.unresolvedCustomerQuestionCount,
    })
  }
}

export async function getAuthenticatedCanonicalFinancialSummary(input: {
  supabase: SupabaseClient
  periodStart: string
  periodEnd: string
  currency: string
}) {
  const { data: { user }, error } = await input.supabase.auth.getUser()
  if (error || !user) throw new Error('An authenticated user is required.')
  const questions = await listCustomerQuestions({ supabase: input.supabase })
  const service = new CanonicalFinancialSummaryService(
    new SupabaseCanonicalFinancialSummaryRepository(input.supabase)
  )
  return service.summarize({
    userId: user.id,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currency: input.currency,
    unresolvedCustomerQuestionCount: questions.length,
  })
}
