import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { listCustomerQuestions } from '../lib/bookkeeping/customer-questions'
import { QuestionFlow } from './QuestionFlow'
import{loadCustomerEntitlements}from'../lib/membership/entitlements'

export const dynamic = 'force-dynamic'

export default async function QuestionsPage({searchParams}:{searchParams:Promise<{start?:string;end?:string}>}) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const membership=await loadCustomerEntitlements(supabase);if(membership.lifecycle==='none')redirect('/membership')
  const query=await searchParams
  const allQuestions = await listCustomerQuestions({ supabase,scope:membership.plan! })
  const questions=/^\d{4}-\d{2}-\d{2}$/.test(query.start??'')&&/^\d{4}-\d{2}-\d{2}$/.test(query.end??'')
    ?allQuestions.filter(question=>question.transaction.date&&question.transaction.date>=query.start!&&question.transaction.date<=query.end!)
    :allQuestions
  return <QuestionFlow initialQuestions={questions} range={query.start&&query.end?{start:query.start,end:query.end}:undefined}/>
}
