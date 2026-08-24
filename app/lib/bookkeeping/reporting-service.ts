import type { SupabaseClient } from '@supabase/supabase-js'
import { listCustomerQuestions } from './customer-questions'
import { buildCanonicalReport } from './reporting-model'
import { SupabaseCanonicalReportingRepository } from './reporting-repository'
import { loadMileageTotal } from '../mileage/repository'
import { listContractorSummaries } from './contractor-awareness'

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
  const [canonical, legacy, questions, categoryLabels, businessMilesMilli, contractorSummaries] = await Promise.all([
    repository.canonical.loadRecords({ businessId, periodStart: input.periodStart, periodEnd: input.periodEnd }),
    repository.loadLegacyRecords({ userId: user.id, periodStart: input.periodStart, periodEnd: input.periodEnd }),
    listCustomerQuestions({ supabase: input.supabase }),
    repository.loadCategoryLabels(),
    loadMileageTotal(input.supabase, { businessId, start: input.periodStart, end: input.periodEnd }),
    listContractorSummaries({ supabase: input.supabase, businessId,
      taxYear: Number(input.periodEnd.slice(0, 4)) }),
  ])
  const report = buildCanonicalReport({ canonicalRecords: canonical.records, legacyRecords: legacy,
    periodStart: input.periodStart, periodEnd: input.periodEnd, currency: input.currency ?? 'USD', categoryLabels })
  return { ...report, businessMilesMilli, mileageDeductionCents: null as null, contractorSummaries,
    mileageTaxTreatmentStatus: businessMilesMilli > 0 ? 'facts_only' as const : 'not_applicable' as const,
    completeness: { ...report.completeness,
    isComplete: report.completeness.isComplete && canonical.undatedRecordCount === 0,
    unresolvedCustomerQuestionCount: questions.length,
    undatedRecordCount: canonical.undatedRecordCount } }
}
