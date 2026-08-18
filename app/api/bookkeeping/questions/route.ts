import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { listCustomerQuestions } from '../../../lib/bookkeeping/customer-questions'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const questions = await listCustomerQuestions({ supabase })
    return NextResponse.json({ questions, count: questions.length })
  } catch {
    return NextResponse.json({ error: 'Unable to load questions.' }, { status: 500 })
  }
}
