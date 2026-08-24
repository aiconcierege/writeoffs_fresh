import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { listMileageContext } from '../lib/mileage/repository'
import { MileageClient } from './MileageClient'

export const dynamic = 'force-dynamic'
export default async function MileagePage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const context = await listMileageContext(supabase)
  return <MileageClient initialVehicles={context.vehicles} initialEntries={context.entries} />
}
