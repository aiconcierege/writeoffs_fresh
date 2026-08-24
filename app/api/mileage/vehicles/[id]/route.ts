import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../utils/supabase/server'
import { requireMileageBusiness } from '../../../../lib/mileage/repository'

export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
  const supabase=await createServerSupabase();let businessId:string
  try{businessId=(await requireMileageBusiness(supabase)).businessId}catch{return NextResponse.json({error:'unauthorized'},{status:401})}
  const body=await request.json().catch(()=>null) as {active?:unknown}|null
  if(typeof body?.active!=='boolean')return NextResponse.json({error:'Choose whether the vehicle is active.'},{status:400})
  const {id}=await context.params
  const {data,error}=await supabase.from('business_vehicles').update({archived_at:body.active?null:new Date().toISOString()})
    .eq('id',id).eq('business_id',businessId).select().single()
  return error?NextResponse.json({error:body.active?'Vehicle could not be activated.':'Vehicle could not be made inactive.'},{status:409}):NextResponse.json({ok:true,vehicle:data})
}
