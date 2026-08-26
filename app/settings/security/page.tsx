import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../../utils/supabase/server'
import { SecuritySettings } from './SecuritySettings'
import { safeAuthenticatedNext } from '../../lib/auth/mfa-policy'

export const dynamic = 'force-dynamic'

export default async function SecuritySettingsPage({ searchParams }: { searchParams: Promise<{ enroll?: string; next?: string }> }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const params = await searchParams
  return <SecuritySettings enrollmentRequired={params.enroll === 'required'} next={safeAuthenticatedNext(params.next)} />
}
