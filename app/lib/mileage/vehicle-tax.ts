export const VEHICLE_TAX_ENGINE_VERSION = 'vehicle-tax:v1' as const

export type VehicleMethod = 'standard_mileage' | 'actual_expenses' | 'unresolved' | 'cpa_review'
export type VehicleExpenseKind = 'fuel' | 'insurance' | 'repair' | 'maintenance' | 'registration'
  | 'tires' | 'parking' | 'tolls' | 'lease_payment' | 'other_operating' | 'purchase' | 'improvement'

export type MileageRate = {
  taxYear: number
  effectiveFrom: string
  effectiveThrough: string
  rateMillisPerMile: number
  authority: string
}

// Thousandths of one cent per mile. This preserves half-cent rates exactly.
export const BUSINESS_MILEAGE_RATES: readonly MileageRate[] = Object.freeze([
  { taxYear: 2025, effectiveFrom: '2025-01-01', effectiveThrough: '2025-12-31', rateMillisPerMile: 70_000,
    authority: 'IRS IR-2024-312' },
  { taxYear: 2026, effectiveFrom: '2026-01-01', effectiveThrough: '2026-06-30', rateMillisPerMile: 72_500,
    authority: 'IRS Notice 2026-10' },
  { taxYear: 2026, effectiveFrom: '2026-07-01', effectiveThrough: '2026-12-31', rateMillisPerMile: 76_000,
    authority: 'IRS Announcement 2026-11' },
])

export function mileageDeductionCents(trips: Array<{ occurredOn: string; milesMilli: number }>) {
  return trips.reduce((total, trip) => {
    const rate = BUSINESS_MILEAGE_RATES.find(candidate => trip.occurredOn >= candidate.effectiveFrom
      && trip.occurredOn <= candidate.effectiveThrough)
    if (!rate) throw new Error(`Unsupported business mileage rate date: ${trip.occurredOn}`)
    if (!Number.isSafeInteger(trip.milesMilli) || trip.milesMilli <= 0) throw new Error('Mileage must use positive integer thousandths.')
    return total + Math.round(trip.milesMilli * rate.rateMillisPerMile / 1_000_000)
  }, 0)
}

export function businessUseBasisPoints(input: { businessMilesMilli: number; totalMilesMilli: number | null; isMixedUse: boolean | null }) {
  if (input.isMixedUse === false) return 10_000
  if (input.totalMilesMilli == null) return null
  if (!Number.isSafeInteger(input.totalMilesMilli) || input.totalMilesMilli <= 0
    || input.businessMilesMilli < 0 || input.businessMilesMilli > input.totalMilesMilli) return null
  return Math.min(10_000, Math.round(input.businessMilesMilli * 10_000 / input.totalMilesMilli))
}

export const separatelyDeductibleWithStandardMileage = (kind: VehicleExpenseKind) => kind === 'parking' || kind === 'tolls'

export function assessVehicleDeduction(input: {
  method: VehicleMethod
  ownership: 'owned' | 'leased' | 'unknown'
  businessMiles: Array<{ occurredOn: string; milesMilli: number }>
  annualBusinessMilesMilli?: number
  historicalMiles?: Array<{from:string;through:string;milesMilli:number}>
  totalMilesMilli: number | null
  isMixedUse: boolean | null
  expenses: Array<{ id: string; kind: VehicleExpenseKind; amountCents: number }>
}) {
  const historical=input.historicalMiles??[]
  const businessMilesMilli = input.businessMiles.reduce((sum, trip) => sum + trip.milesMilli, 0)+historical.reduce((sum,period)=>sum+period.milesMilli,0)
  const allocationBasisPoints = businessUseBasisPoints({ businessMilesMilli:input.annualBusinessMilesMilli??businessMilesMilli,
    totalMilesMilli: input.totalMilesMilli, isMixedUse: input.isMixedUse })
  const expenseRows = input.expenses.map(expense => {
    const special = expense.kind === 'purchase' || expense.kind === 'improvement'
      || (expense.kind === 'lease_payment' && input.ownership === 'leased' && input.method === 'actual_expenses')
    const methodEligible = input.method === 'actual_expenses' || separatelyDeductibleWithStandardMileage(expense.kind)
    const deductibleCents = !special && methodEligible && allocationBasisPoints != null
      ? Math.round(Math.abs(expense.amountCents) * allocationBasisPoints / 10_000) : null
    return { ...expense, status: special ? 'cpa_review' as const
      : input.method === 'unresolved' || allocationBasisPoints == null ? 'requires_facts' as const
        : methodEligible ? 'deductible' as const : 'recorded_not_deducted' as const,
      deductibleCents }
  })
  const mileageDeduction = input.method === 'standard_mileage'
    ? mileageDeductionCents(input.businessMiles)+historical.reduce((sum,period)=>{
      const rate=BUSINESS_MILEAGE_RATES.find(rate=>period.from>=rate.effectiveFrom&&period.through<=rate.effectiveThrough)
      if(!rate||period.from>period.through||!Number.isSafeInteger(period.milesMilli)||period.milesMilli<0)throw new Error('Historical mileage requires a supported rate period.')
      return sum+Math.round(period.milesMilli*rate.rateMillisPerMile/1_000_000)
    },0) : input.method === 'actual_expenses' ? 0 : null
  return {
    version: VEHICLE_TAX_ENGINE_VERSION,
    method: input.method,
    businessMilesMilli,
    totalMilesMilli: input.totalMilesMilli,
    allocationBasisPoints,
    mileageDeductionCents: mileageDeduction,
    actualExpenseCents: input.expenses.filter(row => !['purchase','improvement'].includes(row.kind))
      .reduce((sum, row) => sum + Math.abs(row.amountCents), 0),
    deductibleActualExpenseCents: expenseRows.every(row => !['requires_facts','cpa_review'].includes(row.status))
      ? expenseRows.reduce((sum, row) => sum + (row.deductibleCents ?? 0), 0) : null,
    requiresCpaReview: input.method === 'cpa_review' || expenseRows.some(row => row.status === 'cpa_review')
      || (input.ownership === 'leased' && input.method === 'actual_expenses'),
    cpaReviewReasons: [
      ...(input.ownership === 'leased' && input.method === 'actual_expenses' ? ['LEASE_INCLUSION_AMOUNT'] : []),
      ...(expenseRows.some(row => row.kind === 'purchase') ? ['VEHICLE_PURCHASE_DEPRECIATION'] : []),
      ...(expenseRows.some(row => row.kind === 'improvement') ? ['POSSIBLE_CAPITAL_IMPROVEMENT'] : []),
    ],
    expenses: expenseRows,
  }
}
