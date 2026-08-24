import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { listManualMoney } from '../lib/manual-money/repository'
import { ManualMoneyClient } from './ManualMoneyClient'

export const dynamic = 'force-dynamic'
export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const context = await listManualMoney(supabase)
  const kind = (await searchParams).kind === 'spent' ? 'spent' : 'received'
  return <ManualMoneyClient initialActivities={context.activities} initialDirection={kind} />
}
