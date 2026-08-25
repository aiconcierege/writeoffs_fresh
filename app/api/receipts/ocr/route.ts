import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'

// Compatibility endpoint: canonical extraction is now queue-owned. Calling
// this route never invokes a provider or repeats an existing extraction.
export async function POST(request: Request) {
  const supabase=await createServerSupabase();const{data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
  let id:string|null=null
  try{const body=await request.json();id=typeof body?.id==='string'?body.id:null}catch{return NextResponse.json({error:'invalid json'},{status:400})}
  if(!id)return NextResponse.json({error:'id required'},{status:400})
  const{data,error}=await supabase.from('current_customer_receipt_processing_status')
    .select('receipt_id,processing_status,attempt_count').eq('receipt_id',id).maybeSingle()
  if(error||!data)return NextResponse.json({error:'receipt unavailable'},{status:404})
  return NextResponse.json({ok:true,queued:['queued','processing'].includes(data.processing_status),status:data.processing_status},{status:202})
}
