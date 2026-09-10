import type { SupabaseClient } from '@supabase/supabase-js'
import { listCustomerQuestions } from './customer-questions'
import { buildCanonicalReport } from './reporting-model'
import { SupabaseCanonicalReportingRepository } from './reporting-repository'
import { loadMileageTotal,loadVehicleTaxYearReports } from '../mileage/repository'
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
  const [canonical, legacy, questions, categoryLabels, businessMilesMilli, contractorSummaries,vehicleReports] = await Promise.all([
    repository.canonical.loadRecords({ businessId, periodStart: input.periodStart, periodEnd: input.periodEnd }),
    repository.loadLegacyRecords({ userId: user.id, periodStart: input.periodStart, periodEnd: input.periodEnd }),
    listCustomerQuestions({ supabase: input.supabase }),
    repository.loadCategoryLabels(),
    loadMileageTotal(input.supabase, { businessId, start: input.periodStart, end: input.periodEnd }),
    listContractorSummaries({ supabase: input.supabase, businessId,
      taxYear: Number(input.periodEnd.slice(0, 4)) }),
    loadVehicleTaxYearReports(input.supabase,{businessId,taxYear:Number(input.periodEnd.slice(0,4))}),
  ])
  const report = buildCanonicalReport({ canonicalRecords: canonical.records, legacyRecords: legacy,
    periodStart: input.periodStart, periodEnd: input.periodEnd, currency: input.currency ?? 'USD', categoryLabels })
  const relevantVehicles=vehicleReports.filter(vehicle=>vehicle.businessMilesMilli>0||vehicle.actualExpenseCents>0)
  const vehicleReady=relevantVehicles.every(vehicle=>vehicle.method!=='unresolved'&&vehicle.allocationBasisPoints!=null&&!vehicle.requiresCpaReview)
  const mileageDeductionCents=vehicleReady?relevantVehicles.reduce((sum,vehicle)=>sum+(vehicle.mileageDeductionCents??0),0):null
  const estimatedDeductionsCents=report.estimatedDeductionsCents!=null&&mileageDeductionCents!=null
    ?report.estimatedDeductionsCents+mileageDeductionCents:null
  return { ...report,estimatedDeductionsCents,businessMilesMilli,mileageDeductionCents,vehicleReports, contractorSummaries,
    mileageTaxTreatmentStatus: !relevantVehicles.length ? 'not_applicable' as const : vehicleReady?'ready' as const:'needs_attention' as const,
    completeness: { ...report.completeness,
    isComplete: report.completeness.isComplete && canonical.undatedRecordCount === 0&&vehicleReady,
    unresolvedCustomerQuestionCount: questions.length,
    undatedRecordCount: canonical.undatedRecordCount } }
}
