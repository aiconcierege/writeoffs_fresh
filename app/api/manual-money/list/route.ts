import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { listManualMoney } from '../../../lib/manual-money/repository'

export async function GET() {
  const supabase = await createServerSupabase()
  try { const result = await listManualMoney(supabase); return NextResponse.json({ activities: result.activities }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error && error.message === 'AUTH_REQUIRED' ? 'unauthorized' : 'Activity is unavailable.' }, { status: error instanceof Error && error.message === 'AUTH_REQUIRED' ? 401 : 400 }) }
}
