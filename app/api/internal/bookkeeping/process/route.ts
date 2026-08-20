import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  drainBookkeepingProcessingJobs,
  enqueueUnresolvedBookkeepingRecords,
  MAX_BOOKKEEPING_PROCESSING_BATCH,
} from '../../../../lib/bookkeeping/processing'

export const runtime = 'nodejs'

function authorized(request: Request) {
  const secret = process.env.BOOKKEEPING_WORKER_SECRET
  const provided = request.headers.get('authorization')
  if (!secret || !provided?.startsWith('Bearer ')) return false
  const candidate = provided.slice('Bearer '.length)
  const expectedBuffer = Buffer.from(secret)
  const candidateBuffer = Buffer.from(candidate)
  return expectedBuffer.length === candidateBuffer.length
    && timingSafeEqual(expectedBuffer, candidateBuffer)
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })
  }
  let batchSize = 10
  let reconcileUnresolved = false
  try {
    const body = await request.json() as {
      batch_size?: unknown
      reconcile_unresolved?: unknown
    }
    if (typeof body.batch_size === 'number' && Number.isFinite(body.batch_size)) {
      batchSize = Math.max(1, Math.min(MAX_BOOKKEEPING_PROCESSING_BATCH, Math.trunc(body.batch_size)))
    }
    reconcileUnresolved = body.reconcile_unresolved === true
  } catch {
    // An empty request body uses the conservative default.
  }
  try {
    const queued = reconcileUnresolved
      ? await enqueueUnresolvedBookkeepingRecords({ limit: 100 })
      : 0
    const result = await drainBookkeepingProcessingJobs({ batchSize })
    return NextResponse.json({ queued, ...result })
  } catch {
    return NextResponse.json({ error: 'Bookkeeping processing is temporarily unavailable.' }, { status: 503 })
  }
}
