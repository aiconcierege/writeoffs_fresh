import { describe, expect, it } from 'vitest'
import { assessVehicleDeduction, businessUseBasisPoints, mileageDeductionCents } from '../../app/lib/mileage/vehicle-tax'

describe('vehicle tax-year calculations', () => {
  it('uses date-versioned rates, including the 2026 midyear change', () => {
    expect(mileageDeductionCents([{ occurredOn:'2025-05-01', milesMilli:10_000 }])).toBe(700)
    expect(mileageDeductionCents([{ occurredOn:'2026-06-30', milesMilli:10_000 },
      { occurredOn:'2026-07-01', milesMilli:10_000 }])).toBe(1_485)
    expect(() => mileageDeductionCents([{ occurredOn:'2024-01-01', milesMilli:1_000 }])).toThrow(/Unsupported/)
  })

  it('derives mixed use from underlying business and total miles', () => {
    expect(businessUseBasisPoints({ businessMilesMilli:12_000_000,totalMilesMilli:20_000_000,isMixedUse:true })).toBe(6_000)
    expect(businessUseBasisPoints({ businessMilesMilli:1_000,totalMilesMilli:null,isMixedUse:true })).toBeNull()
    expect(businessUseBasisPoints({ businessMilesMilli:0,totalMilesMilli:null,isMixedUse:false })).toBe(10_000)
  })

  it('prevents incompatible deductions while preserving every expense', () => {
    const standard=assessVehicleDeduction({method:'standard_mileage',ownership:'owned',isMixedUse:true,
      totalMilesMilli:20_000,businessMiles:[{occurredOn:'2026-08-01',milesMilli:10_000}],expenses:[
        {id:'fuel',kind:'fuel',amountCents:-10_000},{id:'parking',kind:'parking',amountCents:-2_000}]})
    expect(standard.mileageDeductionCents).toBe(760)
    expect(standard.expenses).toEqual(expect.arrayContaining([
      expect.objectContaining({id:'fuel',status:'recorded_not_deducted',deductibleCents:null}),
      expect.objectContaining({id:'parking',status:'deductible',deductibleCents:1_000}),
    ]))
    const actual=assessVehicleDeduction({method:'actual_expenses',ownership:'owned',isMixedUse:true,totalMilesMilli:20_000,
      businessMiles:[{occurredOn:'2026-08-01',milesMilli:10_000}],expenses:[{id:'fuel',kind:'fuel',amountCents:-10_000}]})
    expect(actual.mileageDeductionCents).toBe(0)
    expect(actual.deductibleActualExpenseCents).toBe(5_000)
  })

  it('contains purchases/improvements and flags actual leased adjustments for a CPA', () => {
    const result=assessVehicleDeduction({method:'actual_expenses',ownership:'leased',isMixedUse:false,totalMilesMilli:null,
      businessMiles:[],expenses:[{id:'lease',kind:'lease_payment',amountCents:-50_000},
        {id:'purchase',kind:'purchase',amountCents:-3_000_000},{id:'upgrade',kind:'improvement',amountCents:-100_000}]})
    expect(result.deductibleActualExpenseCents).toBeNull()
    expect(result.requiresCpaReview).toBe(true)
    expect(result.cpaReviewReasons).toEqual(['LEASE_INCLUSION_AMOUNT','VEHICLE_PURCHASE_DEPRECIATION','POSSIBLE_CAPITAL_IMPROVEMENT'])
  })
})
