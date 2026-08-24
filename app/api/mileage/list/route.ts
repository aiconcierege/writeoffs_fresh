import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { listMileageContext } from '../../../lib/mileage/repository'

export async function GET(request: Request) {
  const url = new URL(request.url); const year = url.searchParams.get('year')
  const start = year && /^\d{4}$/.test(year) ? `${year}-01-01` : undefined
  const end = year && /^\d{4}$/.test(year) ? `${year}-12-31` : undefined
  try { return NextResponse.json({ ok: true, ...await listMileageContext(await createServerSupabase(), { start, end }) }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error && error.message === 'AUTH_REQUIRED' ? 'unauthorized' : 'Mileage is temporarily unavailable.' },
    { status: error instanceof Error && error.message === 'AUTH_REQUIRED' ? 401 : 500 }) }
}
