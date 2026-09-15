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
  const { data, error } = await supabase.from('current_canonical_mileage_entries').select('miles_milli')
    .eq('business_id', input.businessId).gte('occurred_on', input.start).lte('occurred_on', input.end)
  if (error) throw new Error(`Unable to load mileage totals: ${error.message}`)
  return (data ?? []).reduce((sum, row) => {
    const value = Number(row.miles_milli); const next = sum + value
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(next)) throw new Error('Mileage total exceeds exact numeric range.')
    return next
  }, 0)
}

export async function loadVehicleTaxYearReports(supabase:SupabaseClient,input:{businessId:string;taxYear:number}){
  const start=`${input.taxYear}-01-01`,end=`${input.taxYear}-12-31`
  const [vehiclesResult,identityResult,methodResult,useResult,mileageResult,associationResult]=await Promise.all([
    supabase.from('business_vehicles').select('id,display_name,is_mixed_use').eq('business_id',input.businessId),
    supabase.from('current_vehicle_identities').select('*').eq('business_id',input.businessId),
    supabase.from('current_vehicle_tax_year_methods').select('*').eq('business_id',input.businessId).eq('tax_year',input.taxYear),
    supabase.from('current_vehicle_tax_year_use').select('*').eq('business_id',input.businessId).eq('tax_year',input.taxYear),
    supabase.from('current_canonical_mileage_entries').select('vehicle_id,occurred_on,miles_milli').eq('business_id',input.businessId).gte('occurred_on',start).lte('occurred_on',end),
    supabase.from('current_vehicle_expense_associations').select('id,vehicle_id,bookkeeping_record_id,expense_kind').eq('business_id',input.businessId),
  ])
  const errors=[vehiclesResult,identityResult,methodResult,useResult,mileageResult,associationResult].map(result=>result.error).filter(Boolean)
  if(errors.length)throw new Error(`Unable to load vehicle tax-year facts: ${errors[0]!.message}`)
  const associations=associationResult.data??[];const recordIds=associations.map(row=>row.bookkeeping_record_id)
  const records=recordIds.length?await supabase.from('bookkeeping_records').select('id,amount_cents,occurred_on').eq('business_id',input.businessId).in('id',recordIds).gte('occurred_on',start).lte('occurred_on',end):{data:[],error:null}
  if(records.error)throw new Error(`Unable to load vehicle expenses: ${records.error.message}`)
  const recordById=new Map((records.data??[]).map(row=>[row.id,row]))
  return (vehiclesResult.data??[]).map(vehicle=>{
    const identity=(identityResult.data??[]).find(row=>row.vehicle_id===vehicle.id)
    const method=(methodResult.data??[]).find(row=>row.vehicle_id===vehicle.id)
    const use=(useResult.data??[]).find(row=>row.vehicle_id===vehicle.id)
    return {vehicleId:vehicle.id,displayName:vehicle.display_name,methodEventId:method?.id??null,useEventId:use?.id??null,
      ...assessVehicleDeduction({method:(method?.method??'unresolved') as VehicleMethod,
        ownership:(identity?.ownership??'unknown') as 'owned'|'leased'|'unknown',isMixedUse:vehicle.is_mixed_use,
        totalMilesMilli:use?.total_miles_milli==null?null:Number(use.total_miles_milli),
        businessMiles:(mileageResult.data??[]).filter(row=>row.vehicle_id===vehicle.id).map(row=>({occurredOn:row.occurred_on,milesMilli:Number(row.miles_milli)})),
        expenses:associations.filter(row=>row.vehicle_id===vehicle.id).flatMap(row=>{const record=recordById.get(row.bookkeeping_record_id);return record?[{id:row.bookkeeping_record_id,kind:row.expense_kind as VehicleExpenseKind,amountCents:Number(record.amount_cents)}]:[]})})}
  })
}
