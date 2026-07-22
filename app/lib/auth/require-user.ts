import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../utils/supabase/server'

export async function getAuthenticatedContext() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  return { supabase, user, error }
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

export function temporarilyUnavailableResponse(message: string) {
  return NextResponse.json(
    { error: 'temporarily_unavailable', message },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  )
}
