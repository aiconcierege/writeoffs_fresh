import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { listMileageContext } from '../../../lib/mileage/repository'
import { formatMiles } from '../../../lib/mileage/validation'

const csv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
export async function GET(request: Request) {
  const url = new URL(request.url); const year = url.searchParams.get('year') ?? new Date().getFullYear().toString()
  if (!/^\d{4}$/.test(year)) return NextResponse.json({ error: 'invalid year' }, { status: 400 })
  try {
    const context = await listMileageContext(await createServerSupabase(), { start: `${year}-01-01`, end: `${year}-12-31` })
    const vehicles = new Map(context.vehicles.map((vehicle) => [vehicle.id, vehicle.display_name]))
    const lines = [['Date','Miles','Vehicle','Job or project','Destination','Business purpose'].map(csv).join(',')]
    for (const entry of context.entries) lines.push([entry.occurred_on,formatMiles(Number(entry.miles_milli)),
      vehicles.get(entry.vehicle_id) ?? 'Vehicle',entry.job_label,entry.destination,entry.business_purpose].map(csv).join(','))
    return new NextResponse(`${lines.join('\n')}\n`, { headers: { 'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="writeoffs-mileage-${year}.csv"` } })
  } catch (error) { return NextResponse.json({ error: error instanceof Error && error.message === 'AUTH_REQUIRED' ? 'unauthorized' : 'export unavailable' },
    { status: error instanceof Error && error.message === 'AUTH_REQUIRED' ? 401 : 500 }) }
}
