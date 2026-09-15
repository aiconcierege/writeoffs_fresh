import {loadHistoricalMileage,mergeHistoricalMileage} from './historical-repository'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assessVehicleDeduction, type VehicleExpenseKind, type VehicleMethod } from './vehicle-tax'

export async function requireMileageBusiness(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('AUTH_REQUIRED')
  const { data, error } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  if (error || !data) throw new Error('BUSINESS_UNAVAILABLE')
  return { user, businessId: data.id as string }
}

export async function listMileageContext(supabase: SupabaseClient, input: { start?: string; end?: string } = {}) {
  const { businessId } = await requireMileageBusiness(supabase)
  let entriesQuery = supabase.from('current_canonical_mileage_entries')
    .select('id,current_event_id,miles_milli,occurred_on,vehicle_id,job_label,destination,business_purpose,last_changed_at')
    .eq('business_id', businessId).order('occurred_on', { ascending: false })
  if (input.start) entriesQuery = entriesQuery.gte('occurred_on', input.start)
  if (input.end) entriesQuery = entriesQuery.lte('occurred_on', input.end)
  const [vehiclesResult, entriesResult,identitiesResult,methodsResult,useResult] = await Promise.all([
    supabase.from('business_vehicles').select('id,display_name,vehicle_year,make,model,is_mixed_use,archived_at')
      .eq('business_id', businessId).order('created_at'),
    entriesQuery,
    supabase.from('current_vehicle_identities').select('*').eq('business_id',businessId),
    supabase.from('current_vehicle_tax_year_methods').select('*').eq('business_id',businessId),
    supabase.from('current_vehicle_tax_year_use').select('*').eq('business_id',businessId),
  ])
  const optionalUnavailable=(error:{code?:string}|null)=>Boolean(error&&['42P01','PGRST205'].includes(error.code??''))
  if (vehiclesResult.error || entriesResult.error || (identitiesResult.error&&!optionalUnavailable(identitiesResult.error))
    ||(methodsResult.error&&!optionalUnavailable(methodsResult.error))||(useResult.error&&!optionalUnavailable(useResult.error))) throw new Error('MILEAGE_UNAVAILABLE')
  return { businessId, vehicles: vehiclesResult.data ?? [], entries: entriesResult.data ?? [],
    vehicleIdentities:identitiesResult.data??[],vehicleMethods:methodsResult.data??[],vehicleUseFacts:useResult.data??[] }
}

export async function loadMileageTotal(supabase: SupabaseClient, input: { businessId: string; start: string; end: string }) {
  const [{data,error},facts]=await Promise.all([
    supabase.from('current_canonical_mileage_entries').select('vehicle_id,occurred_on,miles_milli').eq('business_id',input.businessId).gte('occurred_on',input.start).lte('occurred_on',input.end),
    loadHistoricalMileage(supabase,input.businessId,Number(input.end.slice(0,4))),
  ])
  if(error)throw new Error('Mileage totals are unavailable.')
  return mergeHistoricalMileage(data??[],facts,input.start,input.end).milesMilli
}

export async function loadVehicleTaxYearReports(supabase:SupabaseClient,input:{businessId:string;taxYear:number;periodStart?:string;periodEnd?:string}){
  const start=input.periodStart??`${input.taxYear}-01-01`,end=input.periodEnd??`${input.taxYear}-12-31`
  const [vehiclesResult,identityResult,methodResult,useResult,mileageResult,associationResult]=await Promise.all([
    supabase.from('business_vehicles').select('id,display_name,is_mixed_use').eq('business_id',input.businessId),
    supabase.from('current_vehicle_identities').select('*').eq('business_id',input.businessId),
    supabase.from('current_vehicle_tax_year_methods').select('*').eq('business_id',input.businessId).eq('tax_year',input.taxYear),
    supabase.from('current_vehicle_tax_year_use').select('*').eq('business_id',input.businessId).eq('tax_year',input.taxYear),
    supabase.from('current_canonical_mileage_entries').select('vehicle_id,occurred_on,miles_milli').eq('business_id',input.businessId).gte('occurred_on',`${input.taxYear}-01-01`).lte('occurred_on',`${input.taxYear}-12-31`),
    supabase.from('current_vehicle_expense_associations').select('id,vehicle_id,bookkeeping_record_id,expense_kind').eq('business_id',input.businessId),
  ])
  const errors=[vehiclesResult,identityResult,methodResult,useResult,mileageResult,associationResult].map(result=>result.error).filter(Boolean)
  if(errors.length)throw new Error(`Unable to load vehicle tax-year facts: ${errors[0]!.message}`)
  const historical=await loadHistoricalMileage(supabase,input.businessId,input.taxYear)
  const annual=mergeHistoricalMileage(mileageResult.data??[],historical,`${input.taxYear}-01-01`,`${input.taxYear}-12-31`)
  const merged=mergeHistoricalMileage((mileageResult.data??[]).filter(row=>row.occurred_on>=start&&row.occurred_on<=end),historical,start,end)
  const associations=associationResult.data??[];const recordIds=associations.map(row=>row.bookkeeping_record_id)
  const records=recordIds.length?await supabase.from('bookkeeping_records').select('id,amount_cents,occurred_on').eq('business_id',input.businessId).in('id',recordIds).gte('occurred_on',start).lte('occurred_on',end):{data:[],error:null}
  if(records.error)throw new Error(`Unable to load vehicle expenses: ${records.error.message}`)
  const recordById=new Map((records.data??[]).map(row=>[row.id,row]))
  return (vehiclesResult.data??[]).map(vehicle=>{
    const identity=(identityResult.data??[]).find(row=>row.vehicle_id===vehicle.id)
    const method=(methodResult.data??[]).find(row=>row.vehicle_id===vehicle.id)
    const use=(useResult.data??[]).find(row=>row.vehicle_id===vehicle.id)
    const assessment=assessVehicleDeduction({method:(method?.method??'unresolved') as VehicleMethod,
        ownership:(identity?.ownership??'unknown') as 'owned'|'leased'|'unknown',isMixedUse:vehicle.is_mixed_use,
        totalMilesMilli:use?.total_miles_milli==null?null:Number(use.total_miles_milli),
        annualBusinessMilesMilli:annual.trips.filter(row=>row.vehicle_id===vehicle.id).reduce((sum,row)=>sum+Number(row.miles_milli),0)+annual.summaries.filter(row=>row.vehicleId===vehicle.id).reduce((sum,row)=>sum+row.milesMilli,0),
        historicalMiles:merged.summaries.filter(row=>row.vehicleId===vehicle.id),
        businessMiles:merged.trips.filter(row=>row.vehicle_id===vehicle.id).map(row=>({occurredOn:row.occurred_on,milesMilli:Number(row.miles_milli)})),
        expenses:associations.filter(row=>row.vehicle_id===vehicle.id).flatMap(row=>{const record=recordById.get(row.bookkeeping_record_id);return record?[{id:row.bookkeeping_record_id,kind:row.expense_kind as VehicleExpenseKind,amountCents:Number(record.amount_cents)}]:[]})})
    return {...assessment,historicalMileageNeedsAttention:merged.needsAttention,vehicleId:vehicle.id,displayName:vehicle.display_name,methodEventId:method?.id??null,useEventId:use?.id??null,
      mileageDeductionCents:merged.needsAttention?null:assessment.mileageDeductionCents,
      allocationBasisPoints:annual.needsAttention&&vehicle.is_mixed_use!==false?null:assessment.allocationBasisPoints}

  })
}
