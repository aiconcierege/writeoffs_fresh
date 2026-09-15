import type {SupabaseClient} from '@supabase/supabase-js'
import type {HistoricalMileagePeriod} from './historical'
export type HistoricalMileageFact={id:string;vehicle_id:string|null;answer:'entered'|'zero'|'deferred';periods:HistoricalMileagePeriod[]|null;tax_year:number}
export function historicalMileageNeedsFacts(fact:HistoricalMileageFact) {
 return fact.answer==='deferred'||(fact.answer==='entered'&&!fact.vehicle_id&&(fact.periods??[]).some(period=>period.milesMilli>0))
}
export async function loadHistoricalMileage(supabase:SupabaseClient,businessId:string,taxYear:number) {
 const result=await supabase.from('current_historical_mileage').select('id,vehicle_id,answer,periods,tax_year').eq('business_id',businessId).eq('tax_year',taxYear)
 if(result.error)throw new Error('Historical mileage is unavailable.')
 return (result.data??[]) as HistoricalMileageFact[]
}
export function mergeHistoricalMileage(trips:Array<{vehicle_id:string;occurred_on:string;miles_milli:number}>,facts:HistoricalMileageFact[],start:string,end:string) {
 const assigned=facts.filter(f=>f.answer==='entered'&&f.vehicle_id)
 const summaries=assigned.flatMap(f=>(f.periods??[]).filter(p=>p.from>=start&&p.through<=end).map(p=>({...p,vehicleId:f.vehicle_id!})))
 let needsAttention=facts.some(historicalMileageNeedsFacts)
 const matched=(trip:typeof trips[number])=>summaries.find(p=>p.vehicleId===trip.vehicle_id&&trip.occurred_on>=p.from&&trip.occurred_on<=p.through)
 for(const period of summaries){const recorded=trips.filter(t=>t.vehicle_id===period.vehicleId&&t.occurred_on>=period.from&&t.occurred_on<=period.through).reduce((sum,t)=>sum+Number(t.miles_milli),0);if(recorded>period.milesMilli)needsAttention=true}
 if(assigned.some(f=>(f.periods??[]).some(p=>p.through>=start&&p.from<=end&&(p.from<start||p.through>end))))needsAttention=true
 return {trips:trips.filter(t=>!matched(t)),summaries,needsAttention,
   milesMilli:trips.filter(t=>!matched(t)).reduce((sum,t)=>sum+Number(t.miles_milli),0)+summaries.reduce((sum,p)=>sum+p.milesMilli,0)}
}
