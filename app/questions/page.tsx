import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { listCustomerQuestions } from '../lib/bookkeeping/customer-questions'
import { QuestionFlow } from './QuestionFlow'

export const dynamic = 'force-dynamic'

export default async function QuestionsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const questions = await listCustomerQuestions({ supabase })
  return <QuestionFlow initialQuestions={questions} />
}
