import {NextResponse} from 'next/server'
import {createServerSupabase} from '../../../../../../utils/supabase/server'
import {requireCapability,membershipErrorResponse} from '../../../../../lib/membership/entitlements'
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const db=await createServerSupabase(),{data:{user}}=await db.auth.getUser()
 if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
 try{await requireCapability(db,'track_expenses')}catch(e){const r=membershipErrorResponse(e);return NextResponse.json({error:r.error},{status:r.status})}
 let body;try{body=await request.json()}catch{return NextResponse.json({error:'Invalid answer.'},{status:400})}
 const{id}=await params,uuid=/^[0-9a-f-]{36}$/i
 if(!uuid.test(id)||!uuid.test(body.expected??'')||!uuid.test(body.requestId??'')||!['merchant_return','reimbursement','refund_link','refund_unlink','loan_payment','owner_use','card_payment','defer','unsure'].includes(body.action)||body.original&&!uuid.test(body.original)||body.businessCents!=null&&(!Number.isSafeInteger(body.businessCents)||body.businessCents<0))return NextResponse.json({error:'Invalid answer.'},{status:400})
 const result=await db.rpc('record_special_transaction',{p_record:id,p_expected:body.expected,p_request:body.requestId,p_action:body.action,p_original:body.original??null,p_business_cents:body.businessCents??null})
 if(result.error)return NextResponse.json({error:result.error.message},{status:/stale/.test(result.error.message)?409:400})
 return NextResponse.json({ok:true,decisionId:result.data})
}
