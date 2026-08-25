import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { drainCanonicalDocumentJobs, documentQueueHealth } from '../../../../lib/documents/durable-processing'
import { drainBookkeepingProcessingJobs } from '../../../../lib/bookkeeping/processing'
import { drainReceiptUnderstandingJobs } from '../../../../lib/receipts/receipt-understanding'
import {createServerAdminSupabase} from '../../../../../utils/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

function authorized(request: Request) {
  const provided = request.headers.get('authorization')
  if (!provided?.startsWith('Bearer ')) return false
  const actual = Buffer.from(provided.slice(7))
  return [process.env.CRON_SECRET,process.env.BOOKKEEPING_WORKER_SECRET].filter((value):value is string=>Boolean(value))
    .some((secret)=>{const expected=Buffer.from(secret);return expected.length===actual.length&&timingSafeEqual(expected,actual)})
}

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })
  const expiration=await createServerAdminSupabase().rpc('expire_elapsed_business_memberships',{p_now:new Date().toISOString()})
  if(expiration.error)throw new Error('MEMBERSHIP_EXPIRATION_UNAVAILABLE')
  const documents = await drainCanonicalDocumentJobs({ batchSize: 8 })
  const bookkeeping = await drainBookkeepingProcessingJobs({ batchSize: 12 })
  const shadow = await drainReceiptUnderstandingJobs({ batchSize: 3 })
  return NextResponse.json({ documents,bookkeeping,shadow,membershipsExpired:expiration.data,health: await documentQueueHealth() })
}

export async function GET(request: Request) { try { return await run(request) } catch {
  return NextResponse.json({ error: 'Processing is temporarily unavailable.' }, { status: 503 }) } }
export async function POST(request: Request) { return GET(request) }
