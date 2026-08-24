import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../../utils/supabase/server'

export async function DELETE(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (assurance?.currentLevel !== 'aal2') return NextResponse.json({ error: 'recent_verification_required' }, { status: 403 })
  const body = await request.json().catch(() => ({})) as { factorId?: unknown }
  if (typeof body.factorId !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const owned = factors?.totp.some((factor) => factor.id === body.factorId && factor.status === 'verified')
  if (!owned) return NextResponse.json({ error: 'factor_not_found' }, { status: 404 })
  const { error } = await supabase.auth.mfa.unenroll({ factorId: body.factorId })
  if (error) return NextResponse.json({ error: 'security_update_failed' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
