import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../utils/supabase/server'
import { listCustomerQuestions } from '../../../../lib/bookkeeping/customer-questions'

export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
 const supabase=await createServerSupabase();const {data:{user}}=await supabase.auth.getUser()
 if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
 const {id}=await context.params
 const projected=await supabase.rpc('project_receipt_meal_candidate_questions',{p_receipt_id:id})
 if(projected.error)return NextResponse.json({error:'Receipt follow-up is unavailable.'},{status:400})
 const state=(projected.data as {state?:string;record_id?:string}|null)??{}
 if(state.state!=='question_ready')return NextResponse.json({state:state.state??'processing',questions:[]})
 const questions=(await listCustomerQuestions({supabase,scope:'expenses'})).filter(q=>q.recordId===state.record_id)
 return NextResponse.json({state:questions.length?'question_ready':'complete',questions})
}
