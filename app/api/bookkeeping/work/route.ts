import {guidedWorkProjection} from '../../../lib/bookkeeping/guided-work-projection'
import {requestUser} from '../../../lib/performance/request-identity'
import { timedRoute } from '../../../lib/performance/request-timing'
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { loadCustomerEntitlements } from '../../../lib/membership/entitlements'
import { loadBettiWork, loadCanonicalBettiWork } from '../../../lib/bookkeeping/betti-work-loader'
import {actionIndexEnabled} from '../../../lib/bookkeeping/action-index-worker'
import {readBettiActionIndex} from '../../../lib/bookkeeping/action-index-reader'
import {actionPresentation} from '../../../lib/bookkeeping/action-presentation'

export const dynamic = 'force-dynamic'
async function handleGET(request: Request) {
  const db = await createServerSupabase()
  const { data: { user }, error } = await requestUser(db)
  if (error || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: assurance } = await db.auth.mfa.getAuthenticatorAssuranceLevel()
  if (assurance?.currentLevel !== 'aal2') return NextResponse.json({ error: 'MFA required' }, { status: 403 })
  try {
    const membership = await loadCustomerEntitlements(db)
    if (!membership.businessId || membership.lifecycle === 'none')
      return NextResponse.json({ error: 'Membership required' }, { status: 403 })
    const record = new URL(request.url).searchParams.get('record')
    const params=new URL(request.url).searchParams
    const presented=params.get('presented'),presentedVersion=params.get('presentedVersion')
    if((presented!==null||presentedVersion!==null)&&(!presented||presented.length>512||!presentedVersion||presentedVersion.length>128))
      return NextResponse.json({error:'Invalid presentation context'},{status:400})
    if (record && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record))
      return NextResponse.json({ error: 'Invalid context' }, { status: 400 })
    let indexNeedsRefresh=false
    if(params.get('view')==='guided'&&!presented&&actionIndexEnabled()){
      const indexed=await readBettiActionIndex({db,businessId:membership.businessId,view:'guided',continuityRecordId:record??undefined,
        processingEnabled:process.env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED!=='false'})
      if(indexed?.index?.summaryCurrent)return NextResponse.json({...indexed,actionsEnabled:membership.capabilities.has('autonomous_processing')},{headers:{'Cache-Control':'private, no-store'}})
      indexNeedsRefresh=true
    }
    // A presented-action recovery must inspect the canonical snapshot. The
    // convenience loader can return a dirty index with temporarily absent rows.
    const projection = await (presented||indexNeedsRefresh?loadCanonicalBettiWork:loadBettiWork)({ db, businessId: membership.businessId, scope: membership.plan ?? 'expenses',
      continuityRecordId: record ?? undefined, processingEnabled: process.env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED !== 'false' })
    return NextResponse.json({ ...(params.get('view')==='guided'?guidedWorkProjection(projection):projection),
      ...(presented&&presentedVersion?{presentation:actionPresentation(projection,{id:presented,version:presentedVersion})}:{}),
      actionsEnabled: membership.capabilities.has('autonomous_processing') },
      { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Betti’s work summary is temporarily unavailable. Please try again.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}

export const GET = timedRoute(handleGET)
