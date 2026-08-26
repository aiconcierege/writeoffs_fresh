import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || !Number.isInteger(body.checkInWeekday) || body.checkInWeekday < 0
    || body.checkInWeekday > 6 || typeof body.effectiveFrom !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(body.effectiveFrom)) {
    return NextResponse.json({ error: 'Choose a weekly check-in day.' }, { status: 400 })
  }
  const timezone = request.headers.get('x-writeoffs-timezone')
  try {
    if (!timezone) throw new Error('missing timezone')
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
  } catch {
    return NextResponse.json({ error: 'Your timezone could not be confirmed.' }, { status: 400 })
  }
  const { data, error } = await supabase.rpc('set_business_review_cadence', {
    p_check_in_weekday: body.checkInWeekday, p_timezone_name: timezone,
    p_effective_from: body.effectiveFrom,
    p_request_id: typeof body.requestId === 'string' ? body.requestId : crypto.randomUUID(),
  })
  if (error) return NextResponse.json({ error: 'Your check-in day could not be saved.' }, { status: 400 })
  return NextResponse.json({ id: data })
}
