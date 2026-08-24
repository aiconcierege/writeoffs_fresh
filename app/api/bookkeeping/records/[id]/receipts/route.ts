import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../../utils/supabase/server'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const supabase=await createServerSupabase();const {data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
  let body:Record<string,unknown>;try{body=await request.json()}catch{return NextResponse.json({error:'invalid json'},{status:400})}
  const {id}=await params;const receiptId=typeof body.receipt_id==='string'?body.receipt_id:''
  if(!UUID.test(id)||!UUID.test(receiptId))return NextResponse.json({error:'valid activity and receipt ids are required'},{status:400})
  const {data,error}=await supabase.rpc('attach_bookkeeping_receipt_journey',{p_bookkeeping_record_id:id,p_receipt_id:receiptId})
  if(error)return NextResponse.json({error:'Receipt could not be attached to this activity.'},{status:400})
  return NextResponse.json({ok:true,document_link_id:(data as Record<string,unknown>)?.id})
}
