import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { drainCanonicalDocumentJobs, documentQueueHealth } from '../../../../lib/documents/durable-processing'
import { drainBookkeepingProcessingJobs } from '../../../../lib/bookkeeping/processing'
import { drainReceiptUnderstandingJobs } from '../../../../lib/receipts/receipt-understanding'
import { prepareWeeklyReviews } from '../../../../lib/bookkeeping/weekly-review-processing'
import {createServerAdminSupabase} from '../../../../../utils/supabase/admin'
import {drainAccountDeletionQueue}from '../../../../lib/account-lifecycle/deletion'
import {drainLifecycleNotifications}from '../../../../lib/account-lifecycle/notifications'
import {actionIndexEnabled,refreshBettiActionIndex} from '../../../../lib/bookkeeping/action-index-worker'

export const runtime = 'nodejs'
export const maxDuration = 300

function authorized(request: Request) {
  const provided = request.headers.get('authorization')
  if (!provided?.startsWith('Bearer ')) return false
  const actual = Buffer.from(provided.slice(7))
  return [process.env.CRON_SECRET,process.env.BOOKKEEPING_WORKER_SECRET,process.env.INTERNAL_PROCESSING_SECRET].filter((value):value is string=>Boolean(value))
    .some((secret)=>{const expected=Buffer.from(secret);return expected.length===actual.length&&timingSafeEqual(expected,actual)})
}

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })
  const started=performance.now(),timings:Record<string,number>={}
  async function measure<T>(stage:string,work:()=>Promise<T>):Promise<T>{const start=performance.now();try{return await work()}finally{timings[stage]=Math.round(performance.now()-start)}}
  try {
  const actionIndexBefore=actionIndexEnabled()?await measure('indexBefore',()=>refreshBettiActionIndex({limit:12})):null
  const lifecycleStarted=performance.now()
  const expiration=await createServerAdminSupabase().rpc('expire_elapsed_business_memberships',{p_now:new Date().toISOString()})
  if(expiration.error)throw new Error('MEMBERSHIP_EXPIRATION_UNAVAILABLE')
  const accountLifecycle=await drainAccountDeletionQueue(3)
  const lifecycleNotifications=await drainLifecycleNotifications(10)
  timings.lifecycle=Math.round(performance.now()-lifecycleStarted)
  // Emergency cost control: intake remains durable while new OCR/AI work pauses.
  const expensiveProcessingEnabled = process.env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED !== 'false'
  const documents = expensiveProcessingEnabled
    ? await measure('documents',()=>drainCanonicalDocumentJobs({ batchSize: 4 }))
    : { paused: true, claimed: 0, completed: 0, needsAttention: 0, failed: 0, retryScheduled: 0 }
  const enqueueStarted=performance.now()
  const scopeQueue=await createServerAdminSupabase().rpc('enqueue_authorized_scope_processing_batch',{p_limit:12})
  if(scopeQueue.error)throw new Error('SCOPE_REASSESSMENT_QUEUE_UNAVAILABLE')
  const evidenceQueue=await createServerAdminSupabase().rpc('enqueue_economic_evidence_reassessment',{p_limit:12})
  if(evidenceQueue.error)throw new Error('ECONOMIC_EVIDENCE_REASSESSMENT_QUEUE_UNAVAILABLE')
  timings.enqueue=Math.round(performance.now()-enqueueStarted)
  const bookkeeping = await measure('bookkeeping',()=>drainBookkeepingProcessingJobs({ batchSize: 12 }))
  const weeklyReviews = await measure('weeklyReviews',()=>prepareWeeklyReviews({ limit: 12 }))
  const shadow = expensiveProcessingEnabled
    ? await measure('receiptUnderstanding',()=>drainReceiptUnderstandingJobs({ batchSize: 1 }))
    : { paused: true, claimed: 0, completed: 0, failed: 0 }
  const actionIndexAfter=actionIndexEnabled()?await measure('indexAfter',()=>refreshBettiActionIndex({limit:12})):null
  return NextResponse.json({ documents,bookkeeping,weeklyReviews,shadow,accountLifecycle,lifecycleNotifications,expensiveProcessingEnabled,membershipsExpired:expiration.data,health: await documentQueueHealth(),actionIndexBefore,actionIndexAfter })
  } finally {console.info('BOOKKEEPING_DRAIN_TIMING',{...timings,total:Math.round(performance.now()-started)})}
}

export async function GET(request: Request) { try { return await run(request) } catch {
  return NextResponse.json({ error: 'Processing is temporarily unavailable.' }, { status: 503 }) } }
export async function POST(request: Request) { return GET(request) }
