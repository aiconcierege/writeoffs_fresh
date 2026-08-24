import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../../utils/supabase/server'
import { MfaChallenge } from './MfaChallenge'

export const dynamic = 'force-dynamic'

export default async function MfaChallengePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <MfaChallenge next={(await searchParams).next} />
}
