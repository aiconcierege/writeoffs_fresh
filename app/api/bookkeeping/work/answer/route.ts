import {NextResponse} from 'next/server'
import {createServerSupabase} from '../../../../../utils/supabase/server'
import {requireCapability,membershipErrorResponse} from '../../../../lib/membership/entitlements'
import {loadCurrentCustomerWork} from '../../../../lib/bookkeeping/customer-work'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function POST(request:Request){
 const db=await createServerSupabase(),{data:{user}}=await db.auth.getUser()
 if(!user)return NextResponse.json({error:'Sign in to continue.'},{status:401})
 try{await requireCapability(db,'autonomous_processing')}catch(e){const r=membershipErrorResponse(e);return NextResponse.json({error:r.error},{status:r.status})}
 let body;try{body=await request.json()}catch{return NextResponse.json({error:'Check your answer.'},{status:400})}
 if(!uuid.test(body.requestId??'')||typeof body.actionId!=='string'||typeof body.version!=='string'
 ||!['completed','deferred'].includes(body.disposition)||!Array.isArray(body.items)||body.items.length<1||body.items.length>8
 ||!body.answers||typeof body.answers!=='object'||Array.isArray(body.answers))return NextResponse.json({error:'Check the displayed purchases.'},{status:400})
 try{
  const prior=await db.from('betti_guided_assertions').select('action,items,answers,disposition').eq('id',body.requestId).maybeSingle()
  if(prior.error)throw new Error('Review unavailable')
  let type=prior.data?.action
  if(!prior.data){
   const queue=await loadCurrentCustomerWork({supabase:db})
   const action=queue.actions.find(a=>a.id===body.actionId&&a.version===body.version)
   if(!action?.items||JSON.stringify(action.items)!==JSON.stringify(body.items))return NextResponse.json({error:'These purchases changed. I’ll refresh the group before you continue.'},{status:409})
   type=action.type
  }
  const result=await db.rpc('answer_betti_guided_work',{p_request:body.requestId,p_action:type,p_disposition:body.disposition,p_items:body.items,p_answers:body.answers})
  if(result.error)return NextResponse.json({error:'The group changed or is still being assessed. Refresh before continuing.'},{status:409})
  return NextResponse.json({ok:true,result:result.data},{headers:{'Cache-Control':'private, no-store'}})
 }catch{return NextResponse.json({error:'I couldn’t confirm that answer. Please refresh and try again.'},{status:503})}
}
