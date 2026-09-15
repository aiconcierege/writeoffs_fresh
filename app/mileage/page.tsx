import {historicalMileageNeedsFacts,type HistoricalMileageFact} from '../lib/mileage/historical-repository'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { listMileageContext } from '../lib/mileage/repository'
import {HistoricalMileageFollowUp} from './HistoricalMileageFollowUp'
import {loadCustomerEntitlements} from '../lib/membership/entitlements'
import { MileageClient } from './MileageClient'

export const dynamic = 'force-dynamic'
export default async function MileagePage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const context = await listMileageContext(supabase)
  const [historical,setup,membership]=await Promise.all([supabase.from('current_historical_mileage').select('id,answer,vehicle_id,periods,tax_year').eq('business_id',context.businessId).order('tax_year',{ascending:false}).limit(1).maybeSingle(),supabase.from('business_customer_setup').select('joined_month').eq('business_id',context.businessId).maybeSingle(),loadCustomerEntitlements(supabase)])
  const needsHistory=historical.data&&historicalMileageNeedsFacts(historical.data as HistoricalMileageFact)
  return <>{needsHistory&&setup.data&&membership.capabilities.has('track_mileage')&&<HistoricalMileageFollowUp joinedMonth={setup.data.joined_month.slice(0,7)} vehicles={context.vehicles} expectedId={historical.data!.id} initialPeriods={historical.data!.periods??undefined}/>}
    <MileageClient initialVehicles={context.vehicles} initialEntries={context.entries}
    initialVehicleIdentities={context.vehicleIdentities} initialVehicleMethods={context.vehicleMethods}
    initialVehicleUseFacts={context.vehicleUseFacts} /></>
}
