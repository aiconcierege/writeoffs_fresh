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

/** A previously published projection may predate the annual-use policy. Do not
 * render it until the canonical selector has supplied factual timing metadata.
 * Returning false selects the existing canonical fallback; it never hides an
 * action client-side or edits question history. */
export function vehicleQuestionProjectionCurrent(projection: {
 nextAction?: {question?: {source?:string;deductionFact?:{type:string;scopeKey:string|null}}}|null
 customer?: {actionable?: Array<{question?: {source?:string;deductionFact?:{type:string;scopeKey:string|null}}}>;deferred?: Array<{question?: {source?:string;deductionFact?:{type:string;scopeKey:string|null}}}>}
}, now=new Date()) {
 const actions=[projection.nextAction,...(projection.customer?.actionable??[]),...(projection.customer?.deferred??[])]
 return actions.every(action=>{
  const question=action?.question
  if(question?.source!=='deduction')return true
  return !!question.deductionFact&&vehicleAnnualQuestionAvailable(question.deductionFact.type,question.deductionFact.scopeKey,now)
 })
}
