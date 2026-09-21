import { after, NextResponse } from 'next/server'
import { processPlaidWebhookSync, recordPlaidWebhook, verifyPlaidWebhook } from '../../../lib/plaid/webhooks'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const started = performance.now()
  const rawBody = await request.text()
  const verification = request.headers.get('plaid-verification')
  const verified = await verifyPlaidWebhook({
    rawBody, verification,
  })
  if (!verified) return NextResponse.json({ error: 'invalid_webhook' }, { status: 401 })
  try {
    const signal = await recordPlaidWebhook(rawBody, verification!)
    if (signal.shouldSync && signal.itemId) after(() => processPlaidWebhookSync(signal.itemId!))
    console.info('plaid_webhook_received', { itemRecordId: signal.itemId, duplicate: signal.duplicate, syncScheduled: signal.shouldSync, durationMs: Math.round(performance.now() - started) })
    return NextResponse.json({ received: true })
  } catch (error) {
    const invalid = error instanceof Error && error.message === 'INVALID_WEBHOOK'
    return NextResponse.json({ error: invalid ? 'invalid_webhook' : 'webhook_unavailable' }, { status: invalid ? 400 : 503 })
  }
}
