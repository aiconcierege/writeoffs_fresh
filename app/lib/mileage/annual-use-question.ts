import type { VehicleMethod } from './vehicle-tax'

/** Calendar-year totals are final facts, never forecasts or year-to-date readings.
 * Use Hawaii time so the latest US-state calendar year has ended before asking. */
export function completedVehicleTaxYear(taxYear: number, now = new Date()) {
  const currentYear = Number(new Intl.DateTimeFormat('en-US', {year:'numeric',timeZone:'Pacific/Honolulu'}).format(now))
  return Number.isInteger(taxYear) && taxYear >= 1900 && taxYear < currentYear
}
export function needsAnnualVehicleUse(input: { taxYear:number; method:VehicleMethod; isMixedUse:boolean|null; totalMilesMilli:number|null }, now = new Date()) {
  return input.method === 'actual_expenses' && input.isMixedUse !== false
    && input.totalMilesMilli == null && completedVehicleTaxYear(input.taxYear, now)
}
export function vehicleAnnualQuestionAvailable(factType:string, scopeKey:string|null, now=new Date()) {
  return factType !== 'vehicle_total_miles' || completedVehicleTaxYear(Number(scopeKey?.split(':').at(-1)),now)
}
