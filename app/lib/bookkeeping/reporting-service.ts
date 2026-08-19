import type { SupabaseClient } from '@supabase/supabase-js'
import { listCustomerQuestions } from './customer-questions'
import { buildCanonicalReport } from './reporting-model'
import { SupabaseCanonicalReportingRepository } from './reporting-repository'

export async function getAuthenticatedCanonicalReport(input: {
  supabase: SupabaseClient
  periodStart: string
  periodEnd: string
  currency?: string
}) {
  const { data: { user }, error } = await input.supabase.auth.getUser()
  if (error || !user) throw new Error('An authenticated user is required.')
  const repository = new SupabaseCanonicalReportingRepository(input.supabase)
  const businessId = await repository.findBusinessIdForUser(user.id)
  if (!businessId) throw new Error('Business was not found for the authenticated user.')
  const [canonical, legacy, questions, categoryLabels] = await Promise.all([
    repository.canonical.loadRecords({ businessId, periodStart: input.periodStart, periodEnd: input.periodEnd }),
    repository.loadLegacyRecords({ userId: user.id, periodStart: input.periodStart, periodEnd: input.periodEnd }),
    listCustomerQuestions({ supabase: input.supabase }),
    repository.loadCategoryLabels(),
  ])
  const report = buildCanonicalReport({ canonicalRecords: canonical.records, legacyRecords: legacy,
    periodStart: input.periodStart, periodEnd: input.periodEnd, currency: input.currency ?? 'USD', categoryLabels })
  return { ...report, completeness: { ...report.completeness,
    isComplete: report.completeness.isComplete && canonical.undatedRecordCount === 0,
    unresolvedCustomerQuestionCount: questions.length,
    undatedRecordCount: canonical.undatedRecordCount } }
}
