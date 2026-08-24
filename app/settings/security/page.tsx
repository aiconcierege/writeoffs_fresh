import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../../utils/supabase/server'
import { SecuritySettings } from './SecuritySettings'

export const dynamic = 'force-dynamic'

export default async function SecuritySettingsPage({ searchParams }: { searchParams: Promise<{ enroll?: string }> }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <SecuritySettings enrollmentRequired={(await searchParams).enroll === 'required'} />
}
