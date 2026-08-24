import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { requireMileageBusiness } from '../../../lib/mileage/repository'

export async function POST(request: Request) {
  const supabase = await createServerSupabase(); let context
  try { context = await requireMileageBusiness(supabase) } catch { return NextResponse.json({ error:'unauthorized' }, { status:401 }) }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const label = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
  if (!label || label.length > 120 || (body?.isMixedUse !== true && body?.isMixedUse !== false))
    return NextResponse.json({ error:'Vehicle name and personal-use answer are required.' }, { status:400 })
  const { data: active } = await supabase.from('business_vehicles').select('slot').eq('business_id',context.businessId).is('archived_at',null)
  const slot = [1,2].find((candidate) => !(active ?? []).some((row) => row.slot === candidate))
  if (!slot) return NextResponse.json({ error:'WriteOffs currently supports two active vehicles.' }, { status:409 })
  const year = body.vehicleYear == null || body.vehicleYear === '' ? null : Number(body.vehicleYear)
  if (year != null && (!Number.isInteger(year) || year < 1900 || year > 2100)) return NextResponse.json({ error:'Enter a valid vehicle year.' }, { status:400 })
  const optional = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim().slice(0,120) : null
  const { data,error } = await supabase.from('business_vehicles').insert({ business_id:context.businessId,slot,
    display_name:label,vehicle_year:year,make:optional(body.make),model:optional(body.model),is_mixed_use:body.isMixedUse }).select().single()
  return error ? NextResponse.json({ error:'Vehicle could not be added.' },{status:400}) : NextResponse.json({ok:true,vehicle:data})
}
