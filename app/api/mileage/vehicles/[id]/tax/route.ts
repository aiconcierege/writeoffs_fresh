import {completedVehicleTaxYear} from '../../../../../lib/mileage/annual-use-question'
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../../utils/supabase/server'
import { requireMileageBusiness } from '../../../../../lib/mileage/repository'
import { membershipErrorResponse,requireCapability } from '../../../../../lib/membership/entitlements'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
  const supabase=await createServerSupabase();let businessId:string
  try{businessId=(await requireMileageBusiness(supabase)).businessId}catch{return NextResponse.json({error:'unauthorized'},{status:401})}
  try{await requireCapability(supabase,'track_mileage')}catch(cause){const denied=membershipErrorResponse(cause);return NextResponse.json({error:denied.error},{status:denied.status})}
  const {id}=await context.params;const body=await request.json().catch(()=>null) as Record<string,unknown>|null
  if(!UUID.test(id)||!body)return NextResponse.json({error:'Valid vehicle facts are required.'},{status:400})
  const {count}=await supabase.from('business_vehicles').select('id',{count:'exact',head:true}).eq('id',id).eq('business_id',businessId)
  if(count!==1)return NextResponse.json({error:'Vehicle unavailable.'},{status:404})
  const requestKey=typeof body.requestKey==='string'&&UUID.test(body.requestKey)?body.requestKey:null
  if(!requestKey)return NextResponse.json({error:'Valid request identity is required.'},{status:400})
  let result
  if(body.kind==='identity'&&['owned','leased','unknown'].includes(String(body.ownership))){
    result=await supabase.rpc('record_vehicle_identity',{p_vehicle_id:id,p_expected_event_id:body.expectedEventId||null,
      p_ownership:body.ownership,p_business_use_began_on:body.businessUseBeganOn||null,
      p_lease_started_on:body.leaseStartedOn||null,p_lease_ended_on:body.leaseEndedOn||null,p_request_key:`vehicle-identity:${requestKey}`})
  }else if(body.kind==='method'&&Number.isInteger(body.taxYear)&&['standard_mileage','actual_expenses','unresolved','cpa_review'].includes(String(body.method))){
    result=await supabase.rpc('record_vehicle_tax_year_method',{p_vehicle_id:id,p_tax_year:body.taxYear,
      p_expected_event_id:body.expectedEventId||null,p_method:body.method,p_request_key:`vehicle-method:${requestKey}`})
  }else if(body.kind==='total_miles'&&Number.isInteger(body.taxYear)&&typeof body.totalMiles==='string'&&/^\d+(?:\.\d{1,3})?$/.test(body.totalMiles)){
    if(!completedVehicleTaxYear(Number(body.taxYear)))return NextResponse.json({error:'Yearly mileage can be finalized after the year ends.'},{status:400})
    const totalMilesMilli=Math.round(Number(body.totalMiles)*1000)
    result=await supabase.rpc('record_vehicle_tax_year_total_miles',{p_vehicle_id:id,p_tax_year:body.taxYear,
      p_expected_event_id:body.expectedEventId||null,p_total_miles_milli:totalMilesMilli,p_request_key:`vehicle-use:${requestKey}`})
  }else return NextResponse.json({error:'Choose valid vehicle facts.'},{status:400})
  return result.error?NextResponse.json({error:/changed|reload/i.test(result.error.message)?'These vehicle details changed. Reload and try again.':'Vehicle details could not be saved.'},{status:/changed|reload/i.test(result.error.message)?409:400})
    :NextResponse.json({ok:true,eventId:result.data})
}
