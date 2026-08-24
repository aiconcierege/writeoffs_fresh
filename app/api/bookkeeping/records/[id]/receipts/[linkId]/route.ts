import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../../../utils/supabase/server'

export async function DELETE(_request:Request,{params}:{params:Promise<{id:string;linkId:string}>}){
  const supabase=await createServerSupabase();const {data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
  const {id,linkId}=await params
  const {data:link}=await supabase.from('bookkeeping_document_links').select('id').eq('id',linkId).eq('bookkeeping_record_id',id).is('revoked_at',null).maybeSingle()
  if(!link)return NextResponse.json({error:'Receipt link not found.'},{status:404})
  const {error}=await supabase.rpc('revoke_bookkeeping_receipt_journey',{p_document_link_id:linkId,p_reason:'Customer removed this receipt from the activity.'})
  if(error)return NextResponse.json({error:'Receipt could not be removed safely.'},{status:400})
  return NextResponse.json({ok:true})
}
