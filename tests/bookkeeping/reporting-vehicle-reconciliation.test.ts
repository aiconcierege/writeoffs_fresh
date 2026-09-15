import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ vehicles: vi.fn(), records: vi.fn(), owner: vi.fn() }))
vi.mock('../../app/lib/bookkeeping/reporting-repository', () => ({ SupabaseCanonicalReportingRepository: class {
  canonical = { loadRecords: mocks.records }
  findBusinessIdForUser = mocks.owner
  loadLegacyRecords = async () => []
  loadCategoryLabels = async () => ({ 'car-truck': 'Car and truck expenses' })
} }))
vi.mock('../../app/lib/bookkeeping/customer-questions', () => ({ listCustomerQuestions: async () => [] }))
vi.mock('../../app/lib/bookkeeping/contractor-awareness', () => ({ listContractorSummaries: async () => [] }))
vi.mock('../../app/lib/mileage/repository', () => ({ loadMileageTotal: async () => 10000, loadVehicleTaxYearReports: mocks.vehicles }))
vi.mock('../../app/lib/mileage/historical-repository',async importOriginal=>({...await importOriginal<typeof import('../../app/lib/mileage/historical-repository')>(),loadHistoricalMileage:async()=>[]}))
import { getAuthenticatedCanonicalReport } from '../../app/lib/bookkeeping/reporting-service'
const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'owner-a' } } }) } }
beforeEach(() => {
  mocks.owner.mockResolvedValue('business-a')
  mocks.records.mockResolvedValue({ undatedRecordCount: 0, records: [{ id: 'record', occurredOn: '2025-04-01', amountCents: -10000,
    currency: 'USD', decisions: [{ id: 'decision', supersedesDecisionId: null, bookkeepingNature: 'expense', treatment: 'business',
      allocations: [{ id: 'allocation', kind: 'business', amountCents: -10000, taxCategoryKey: 'car-truck', taxTreatments: [{ id: 'tax',
        allocationId: 'allocation', supersedesTaxTreatmentId: null, status: 'deductible', deductibleAmountCents: -10000, taxCategoryKey: 'car-truck' }] }] }] }] })
})
describe('canonical vehicle reconciliation', () => {
  it('counts actual expenses once through their canonical allocation treatments', async () => {
    mocks.vehicles.mockResolvedValue([{ method: 'actual_expenses', businessMilesMilli: 10000, actualExpenseCents: 10000,
      allocationBasisPoints: 10000, mileageDeductionCents: 0, deductibleActualExpenseCents: 10000 }])
    const report = await getAuthenticatedCanonicalReport({ supabase: supabase as never, periodStart: '2025-01-01', periodEnd: '2025-12-31' })
    expect(report.estimatedDeductionsCents).toBe(10000)
    expect(report.deductibleCategoryTotals[0].amountCents).toBe(10000)
    expect(mocks.owner).toHaveBeenCalledWith('owner-a')
  })
  it('adds standard mileage once to both supported deductions and the car category', async () => {
    mocks.vehicles.mockResolvedValue([{ method: 'standard_mileage', businessMilesMilli: 10000, actualExpenseCents: 10000,
      allocationBasisPoints: 10000, mileageDeductionCents: 700, deductibleActualExpenseCents: 10000 }])
    const report = await getAuthenticatedCanonicalReport({ supabase: supabase as never, periodStart: '2025-01-01', periodEnd: '2025-12-31' })
    expect(report.estimatedDeductionsCents).toBe(10700)
    expect(report.deductibleCategoryTotals.reduce((sum, row) => sum + row.amountCents, 0)).toBe(10700)
    expect(report.businessExpensesCents).toBe(10700)
    expect(report.businessProfitCents).toBe(-10700)
    expect(report.vehicleReports[0].mileageDeductionCents).toBe(700)
  })
})
