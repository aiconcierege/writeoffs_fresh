import {NextResponse}from'next/server'
import{createServerSupabase}from'../../../../utils/supabase/server'
import{cancelAccountDeletion,scheduleAccountDeletion}from'../../../lib/account-lifecycle/deletion'
const validKey=(value:unknown):value is string=>typeof value==='string'&&value.length>=8&&value.length<=200
export async function POST(request:Request){try{const body=await request.json().catch(()=>null)as{requestKey?:string}|null;if(!validKey(body?.requestKey))return NextResponse.json({error:'Confirm this request and try again.'},{status:400})
 const result=await scheduleAccountDeletion({supabase:await createServerSupabase(),requestKey:body.requestKey});return NextResponse.json({ok:true,request:result})
}catch(error){const code=error instanceof Error?error.message:'';if(code==='AUTHENTICATION_REQUIRED')return NextResponse.json({error:'Sign in again.'},{status:401});if(code==='AAL2_REQUIRED')return NextResponse.json({error:'Complete MFA before deleting your account.'},{status:403});return NextResponse.json({error:'We could not schedule deletion. Nothing has been deleted. Please try again.'},{status:503})}}
export async function DELETE(request:Request){try{const body=await request.json().catch(()=>null)as{requestId?:string;requestKey?:string}|null;if(!body?.requestId||!validKey(body.requestKey))return NextResponse.json({error:'Choose a valid deletion request.'},{status:400})
 const result=await cancelAccountDeletion({supabase:await createServerSupabase(),requestId:body.requestId,requestKey:body.requestKey});return NextResponse.json({ok:true,...result})
}catch(error){const code=error instanceof Error?error.message:'';if(code==='AUTHENTICATION_REQUIRED')return NextResponse.json({error:'Sign in again.'},{status:401});if(code==='AAL2_REQUIRED')return NextResponse.json({error:'Complete MFA before changing deletion.'},{status:403});return NextResponse.json({error:'This deletion request can no longer be canceled.'},{status:409})}}
