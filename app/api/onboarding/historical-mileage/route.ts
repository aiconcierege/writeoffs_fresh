import {NextResponse} from 'next/server'
import {createServerSupabase} from '../../../../utils/supabase/server'
export async function POST(request:Request) {
 const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser()
 if(!user)return NextResponse.json({error:'Please sign in.'},{status:401})
 const body=await request.json().catch(()=>null)
 if(!body||!['entered','zero','deferred'].includes(body.answer)||typeof body.requestId!=='string')return NextResponse.json({error:'Choose an answer or come back later.'},{status:400})
 const {data,error}=await supabase.rpc('record_historical_mileage',{p_answer:body.answer,p_periods:body.answer==='entered'?body.periods:null,p_vehicle_id:body.vehicleId||null,p_request_id:body.requestId,p_expected_id:body.expectedId||null})
 if(error)return NextResponse.json({error:'We couldn’t save these miles. Check your entries, or refresh if you changed them elsewhere.'},{status:409})
 return NextResponse.json({id:data})
}
