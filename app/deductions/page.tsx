import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { DeductionProfile } from './DeductionProfile'

export const dynamic = 'force-dynamic'

export default async function DeductionsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  const { data: facts } = await supabase.from('current_deduction_business_facts').select('*')
    .eq('business_id', business!.id).order('created_at')
  return <DeductionProfile initialFacts={facts ?? []} />
}
