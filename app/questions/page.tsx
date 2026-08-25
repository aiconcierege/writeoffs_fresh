import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { listCustomerQuestions } from '../lib/bookkeeping/customer-questions'
import { QuestionFlow } from './QuestionFlow'
import{loadCustomerEntitlements}from'../lib/membership/entitlements'

export const dynamic = 'force-dynamic'

export default async function QuestionsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const membership=await loadCustomerEntitlements(supabase);if(membership.lifecycle==='none')redirect('/membership')
  const questions = await listCustomerQuestions({ supabase,scope:membership.plan! })
  return <QuestionFlow initialQuestions={questions} />
}
