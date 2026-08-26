import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../utils/supabase/server'

export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
  const{id}=await context.params
  const business=await supabase.from('businesses').select('id').eq('owner_user_id',user.id).single()
  if(!business.data)return NextResponse.json({error:'not found'},{status:404})
  const receipt=await supabase.from('receipts').select('storage_path').eq('id',id).eq('business_id',business.data.id)
    .eq('user_id',user.id).maybeSingle()
  if(!receipt.data)return NextResponse.json({error:'not found'},{status:404})
  const signed=await supabase.storage.from('receipts').createSignedUrl(receipt.data.storage_path,120)
  if(!signed.data?.signedUrl)return NextResponse.json({error:'Receipt is unavailable.'},{status:503})
  return NextResponse.redirect(signed.data.signedUrl,303)
}
