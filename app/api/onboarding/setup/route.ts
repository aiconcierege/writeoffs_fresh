import {NextResponse} from 'next/server'
import {createServerSupabase} from '../../../../utils/supabase/server'
export async function POST(request:Request) {
  const supabase=await createServerSupabase()
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'Please sign in.'},{status:401})
  const body=await request.json().catch(()=>null)
  if(typeof body?.timezone!=='string')return NextResponse.json({error:'Your timezone could not be confirmed.'},{status:400})
  const {error}=await supabase.rpc('complete_customer_setup',{p_timezone:body.timezone})
  if(error)return NextResponse.json({error:error.message.includes('choose how')?'Choose how you use each connected account before continuing.':'We couldn’t finish setup. Please try again.'},{status:409})
  return NextResponse.json({ok:true})
}
